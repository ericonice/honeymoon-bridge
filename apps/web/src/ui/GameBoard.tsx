import { legalActionsForView, revealsUnseenCard } from "@hb/engine";
import type { Call, Card, DealPhase, DrawReveal, PlayerView } from "@hb/engine";
import { useEffect, useRef, useState } from "react";
import { drawTurnDuration, trickCollectDuration } from "../game/timing.js";
import type { GameSession } from "../game/session.js";
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
  onShowSettings(): void;
}

/** The cards the follow-suit rule allows right now, or null outside the play phase. */
function playableCards(view: PlayerView): Card[] | null {
  if (view.phase !== "play" || view.toAct !== view.me) {
    return null;
  }
  return legalActionsForView(view).flatMap((action) =>
    action.type === "play" ? [action.card] : [],
  );
}

function CurrentPhase({
  onDone,
  peeking,
  phase,
  session,
}: {
  readonly onDone: (() => void) | null;
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
          lastOwnDraw={session.lastOwnDraw}
          opponentName={session.opponentName}
          peekLastDraw={peeking ? session.opponentLastDraw : null}
          peekPending={peeking ? session.opponentPending : null}
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
 * How long the phase just left still needs to finish what it was showing, or
 * null when it has nothing left to play out.
 *
 * Both of these are the same mistake in two places: a phase ends on a beat the
 * engine has no reason to wait for, so the last turn of the phase is the one
 * turn nobody gets to watch.
 */
function finalBeat(left: DealPhase, entered: DealPhase, lastDraw: DrawReveal | null): number | null {
  // The twenty-sixth draw turn becomes the auction the instant it resolves, and
  // on a keep that made card 2 — which §1.3 requires you to be shown — the one
  // card of the phase you never saw.
  if (left === "draw" && lastDraw !== null) {
    return drawTurnDuration(lastDraw.taken !== null, revealsUnseenCard(lastDraw));
  }
  // The thirteenth trick is the same shape. The deal is complete the moment the
  // last card lands, so the trick that decides a contract was swept off the
  // table by the scorepad arriving on top of it.
  if (left === "play" && entered === "complete") {
    return trickCollectDuration();
  }
  return null;
}

/**
 * The phase to *show*, which lags the engine at the end of the draw and again
 * at the end of the play.
 *
 * Holding the outgoing phase for the length of its own last animation gives the
 * final turn the same ending as every turn before it.
 */
function useShownPhase(session: GameSession): DealPhase {
  const actual = session.view.phase;
  const [held, setHeld] = useState<DealPhase | null>(null);
  const previous = useRef(actual);
  const { lastDraw } = session;

  useEffect(() => {
    const left = previous.current;
    previous.current = actual;
    if (left === actual) {
      return;
    }

    const hold = finalBeat(left, actual, lastDraw);
    if (hold === null) {
      return;
    }

    setHeld(left);
    const timer = setTimeout(() => {
      setHeld(null);
    }, hold);
    return () => {
      clearTimeout(timer);
    };
    // Only the transition matters; re-running on anything else would reopen a
    // phase the player has already left.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual]);

  return held ?? actual;
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
}: GameBoardProps): React.JSX.Element {
  const [showingScore, setShowingScore] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const { view } = session;
  const phase = useShownPhase(session);
  const playable = playableCards(view);

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

      {import.meta.env.DEV && peeking && session.opponentHand !== null ? (
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
