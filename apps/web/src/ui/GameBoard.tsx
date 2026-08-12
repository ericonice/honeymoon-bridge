import { legalActionsForView } from "@hb/engine";
import type { Call, Card, DealPhase, DrawReveal, PlayerView } from "@hb/engine";
import { useEffect, useRef, useState } from "react";
import { drawPlayout, trickCollectDuration } from "../game/timing.js";
import type { GameSession } from "../game/session.js";
import { useGameSounds } from "../game/useGameSounds.js";
import { AuctionPhase } from "./AuctionPhase.js";
import { DealComplete } from "./DealComplete.js";
import { DrawPhase } from "./DrawPhase.js";
import { Hand } from "./Hand.js";
import { LeaveConfirm } from "./LeaveConfirm.js";
import { OpponentPeek } from "./OpponentPeek.js";
import { PlayPhase } from "./PlayPhase.js";
import { ScoreOverlay } from "./ScoreOverlay.js";
import { TopBar } from "./TopBar.js";

/**
 * The way out of this match, and what to say about taking it.
 *
 * The board knows nothing about where the game is running, and whether anybody
 * else is told when you walk out is exactly that knowledge — so the words come
 * from whoever set the game up, and this only renders them.
 */
export interface GameExit {
  /** Heading on the confirmation. */
  readonly title: string;
  /** What leaving costs. */
  readonly warning: string;
  leave(): void;
}

export interface GameBoardProps {
  readonly devTools: boolean;
  /** Null when this match has no exit of its own to offer. */
  readonly exit: GameExit | null;
  readonly peeking: boolean;
  readonly session: GameSession;
  readonly sound: boolean;
  onShowSettings(): void;
}

/**
 * The cards the follow-suit rule allows right now, or null outside the play
 * phase — going by the phase this seat is *shown*, not the engine's, since the
 * engine has already moved on by the time an auction close is still being
 * held open. The engine's own phase would light these up against whatever the
 * computer just led, in sync with a screen the player has not reached yet.
 */
function playableCards(view: PlayerView, shownPhase: DealPhase): Card[] | null {
  if (shownPhase !== "play" || view.toAct !== view.me) {
    return null;
  }
  return legalActionsForView(view).flatMap((action) =>
    action.type === "play" ? [action.card] : [],
  );
}

function CurrentPhase({
  onDone,
  onStartPlay,
  peeking,
  phase,
  session,
}: {
  readonly onDone: (() => void) | null;
  /** Non-null only while the closed auction is waiting to be dismissed. */
  readonly onStartPlay: (() => void) | null;
  readonly peeking: boolean;
  readonly phase: DealPhase;
  readonly session: GameSession;
}): React.JSX.Element {
  const { history, lastDraw, lastTrick, nextDeal, rubber, score, view, vulnerable } = session;

  switch (phase) {
    case "draw": {
      return (
        <DrawPhase
          lastDraw={lastDraw}
          opponentName={session.opponentName}
          peekLastDraw={peeking ? session.opponentLastDraw : null}
          peekPending={peeking ? session.opponentPending : null}
          showingTheirCards={peeking && session.opponentHand !== null}
          vulnerable={vulnerable}
          view={view}
          onDecide={(keep) => {
            session.act({ type: "draw-decide", keep });
          }}
        />
      );
    }
    case "auction": {
      return (
        <AuctionPhase
          opponentName={session.opponentName}
          view={view}
          vulnerable={vulnerable}
          onCall={(call: Call) => {
            session.act({ type: "call", call });
          }}
          onStartPlay={onStartPlay}
        />
      );
    }
    case "play": {
      return (
        <PlayPhase
          lastTrick={lastTrick}
          opponentName={session.opponentName}
          view={view}
          vulnerable={vulnerable}
        />
      );
    }
    default: {
      return (
        <DealComplete
          history={history}
          opponentName={session.opponentName}
          opponentWaitingToContinue={session.opponentWaitingToContinue}
          rubber={rubber}
          score={score}
          view={view}
          vulnerable={vulnerable}
          waitingToContinue={session.waitingToContinue}
          onDone={onDone}
          onNextDeal={nextDeal}
        />
      );
    }
  }
}

/**
 * What the phase just left still needs before it can be replaced, or null when
 * it has nothing left to show.
 *
 * All three are the same mistake in three places: a phase ends on a beat the
 * engine has no reason to wait for, so the last thing that happened in it is
 * the one thing nobody gets to see.
 */
type FinalBeat =
  /** Dismissed by hand, because nothing about it supplies a length. */
  | { readonly kind: "dismissed" }
  | { readonly kind: "timed"; readonly ms: number };

function finalBeat({
  entered,
  lastDraw,
  left,
  meIsDeclarer,
  theirCardsShowing,
}: {
  readonly entered: DealPhase;
  readonly lastDraw: DrawReveal | null;
  readonly left: DealPhase;
  /** Only meaningful for an auction that just closed. */
  readonly meIsDeclarer: boolean;
  readonly theirCardsShowing: boolean;
}): FinalBeat | null {
  // The twenty-sixth draw turn becomes the auction the instant it resolves, and
  // on a keep that made card 2 — which §1.3 requires you to be shown — the one
  // card of the phase you never saw.
  if (left === "draw" && lastDraw !== null) {
    return { kind: "timed", ms: drawPlayout(lastDraw, theirCardsShowing).duration };
  }
  // The thirteenth trick is the same shape. The deal is complete the moment the
  // last card lands, so the trick that decides a contract was swept off the
  // table by the scorepad arriving on top of it.
  if (left === "play" && entered === "complete") {
    return { kind: "timed", ms: trickCollectDuration() };
  }
  // And the auction, which is the same shape with no length to borrow: a sweep
  // and a card 2 can be waited out, a closed auction cannot. The contract lives
  // on in the top bar but the calls that reached it do not, so the record of
  // how the deal got priced is what vanishes — unless the pass that closed the
  // auction was this seat's own. That pass already said "done" the instant it
  // was made, and the leader of the first trick is always declarer's opponent,
  // so this seat's own closing pass means it leads next regardless — nothing
  // for a held screen to protect it from. A pass from the other side is the
  // one that needs a beat, since that is the case where the computer leads.
  if (left === "auction" && entered === "play") {
    return meIsDeclarer ? { kind: "dismissed" } : null;
  }
  return null;
}

/** The phase to show, and the way out of it when only a tap will end it. */
interface ShownPhase {
  readonly phase: DealPhase;
  /** Non-null only while the screen is waiting to be dismissed. */
  readonly release: (() => void) | null;
}

/**
 * The phase to *show*, which lags the engine at the end of every phase but one.
 *
 * Holding the outgoing phase gives the last thing that happened in it the same
 * ending as everything before it. What ends the hold differs: an animation
 * supplies its own length, and a closed auction supplies none, so that one is
 * dismissed by hand.
 *
 * Nothing here holds up the *game* — only this seat's view of it. The engine
 * has moved on, the computer goes on taking its turns, and over a network the
 * other seat could not be stopped anyway.
 */
function useShownPhase(session: GameSession, peeking: boolean): ShownPhase {
  const actual = session.view.phase;
  const [held, setHeld] = useState<DealPhase | null>(null);
  const [dismissable, setDismissable] = useState(false);
  const previous = useRef(actual);
  const { lastDraw } = session;
  // The setting alone is not enough: over a network the opponent's cards are
  // never sent to this device, so nothing is showing however it is set. Same
  // rule the draw screen goes by, so the two cannot disagree about whether the
  // turn it is holding the phase open for was animated.
  const theirCardsShowing = peeking && session.opponentHand !== null;
  const meIsDeclarer = session.view.contract?.declarer === session.view.me;

  useEffect(() => {
    const left = previous.current;
    previous.current = actual;
    if (left === actual) {
      return;
    }

    const beat = finalBeat({ entered: actual, lastDraw, left, meIsDeclarer, theirCardsShowing });
    if (beat === null) {
      return;
    }

    setHeld(left);
    // Set either way: a phase reached by a shortcut rather than by being played
    // out can arrive while an earlier hold is still standing.
    setDismissable(beat.kind === "dismissed");
    if (beat.kind === "dismissed") {
      return;
    }

    const timer = setTimeout(() => {
      setHeld(null);
    }, beat.ms);
    return () => {
      clearTimeout(timer);
    };
    // Only the transition matters; re-running on anything else would reopen a
    // phase the player has already left.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual]);

  return {
    phase: held ?? actual,
    release: dismissable
      ? () => {
          setDismissable(false);
          setHeld(null);
        }
      : null,
  };
}

/**
 * The board, for any session.
 *
 * Knows nothing about where the game is running: against the computer it is fed
 * by a reducer in this tab, over a network by a Durable Object. That the same
 * component serves both is the test of whether `GameSession` was drawn in the
 * right place.
 */
export function GameBoard({
  devTools,
  exit,
  onShowSettings,
  peeking,
  session,
  sound,
}: GameBoardProps): React.JSX.Element {
  const [showingScore, setShowingScore] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const { view } = session;
  const { phase, release } = useShownPhase(session, peeking);
  const playable = playableCards(view, phase);
  useGameSounds(session, sound);

  // Once the match is won there is nothing left to lose by going, so the exit
  // stops asking. Mid-rubber it always asks, including between deals — a
  // part-score and two games' history are exactly what walking out throws away.
  const settled = session.rubber.complete;

  return (
    <>
      <TopBar
        opponentName={session.opponentName}
        phase={phase}
        view={view}
        onLeave={
          exit === null
            ? null
            : settled
              ? exit.leave
              : () => {
                  setConfirmingLeave(true);
                }
        }
        // The score screen already shows the scorepad in full.
        onShowScore={
          phase === "complete"
            ? null
            : () => {
                setShowingScore(true);
              }
        }
        onShowSettings={onShowSettings}
        onSkipPhase={
          devTools && view.phase !== "complete" && session.skipPhase !== null
            ? session.skipPhase
            : null
        }
      />

      {peeking && session.opponentHand !== null ? (
        <OpponentPeek cards={session.opponentHand} />
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col">
        {/* Offered only on the screen that ends a match, where "done" is a real
            answer rather than a way out of something unfinished. */}
        <CurrentPhase
          peeking={peeking}
          phase={phase}
          session={session}
          onDone={settled && exit !== null ? exit.leave : null}
          onStartPlay={release}
        />
      </main>

      {/* "No cards yet" is true at the start of the draw and a lie at the end
          of the thirteenth trick, where the hand is empty because all of it has
          been played. An emptied hand takes its row with it. */}
      {phase === "complete" || (phase !== "draw" && view.hand.length === 0) ? null : (
        <footer className="border-t border-white/10 pt-1">
          <Hand
            cards={view.hand}
            highlight={session.justTaken}
            playable={playable}
            onPlay={
              playable === null
                ? null
                : (card: Card) => {
                    session.act({ type: "play", card });
                  }
            }
          />
        </footer>
      )}

      {showingScore ? (
        <ScoreOverlay
          history={session.history}
          opponentName={session.opponentName}
          rubber={session.rubber}
          view={view}
          vulnerable={session.vulnerable}
          onClose={() => {
            setShowingScore(false);
          }}
        />
      ) : null}

      {confirmingLeave && exit !== null ? (
        <LeaveConfirm
          title={exit.title}
          warning={exit.warning}
          onCancel={() => {
            setConfirmingLeave(false);
          }}
          onConfirm={exit.leave}
        />
      ) : null}
    </>
  );
}
