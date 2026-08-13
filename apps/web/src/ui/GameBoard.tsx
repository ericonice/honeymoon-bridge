import { cardId, legalActionsForView } from "@hb/engine";
import type { Call, Card, DealPhase, DrawReveal, PlayerId, PlayerView } from "@hb/engine";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { drawPlayout } from "../game/timing.js";
import type { GameSession } from "../game/session.js";
import { useGameSounds } from "../game/useGameSounds.js";
import { AchievementToast } from "./AchievementToast.js";
import { AuctionPhase } from "./AuctionPhase.js";
import { BiddingOverlay } from "./BiddingOverlay.js";
import { ClaimConfirm } from "./ClaimConfirm.js";
import { ClaimReveal } from "./ClaimReveal.js";
import type { ClaimResult } from "./ClaimResultToast.js";
import { ClaimResultToast } from "./ClaimResultToast.js";
import { ContractBar } from "./ContractBar.js";
import { DealComplete } from "./DealComplete.js";
import { DrawPhase } from "./DrawPhase.js";
import { HAND_HEIGHT, Hand } from "./Hand.js";
import { LastTrickOverlay } from "./LastTrickOverlay.js";
import { LeaveConfirm } from "./LeaveConfirm.js";
import { OpponentPeek } from "./OpponentPeek.js";
import { PlayPhase } from "./PlayPhase.js";
import { PlayToolbar } from "./PlayToolbar.js";
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
  readonly tapToSelect: boolean;
  onShowSettings(): void;
}

/**
 * The cards the follow-suit rule allows right now, or null outside the play
 * phase — going by the phase this seat is *shown*, not the engine's, since the
 * engine has already moved on by the time an auction close is still being
 * held open. The engine's own phase would light these up against whatever the
 * computer just led, in sync with a screen the player has not reached yet.
 *
 * Not blocked by `GameSession.trickAwaitingDismissal`, on purpose: a tap on a
 * card in hand is already the deliberate "I have seen enough, move on" a tap
 * on the table would have been, so it plays immediately rather than asking
 * for that as a separate motion first — see the `onPlay` that dismisses
 * alongside it.
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
  handOriginRef,
  onDismissTrick,
  onDone,
  onStartPlay,
  peeking,
  phase,
  session,
}: {
  readonly handOriginRef: React.RefObject<DOMRect | null>;
  onDismissTrick(): void;
  readonly onDone: (() => void) | null;
  /** Non-null only while the closed auction — or the deal's last trick — is waiting to be dismissed. */
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
          handOriginRef={handOriginRef}
          lastTrick={lastTrick}
          opponentName={session.opponentName}
          release={onStartPlay}
          view={view}
          vulnerable={vulnerable}
          onDismissTrick={onDismissTrick}
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
  claimedFinish,
  entered,
  lastDraw,
  left,
  meIsDeclarer,
  theirCardsShowing,
}: {
  /** True when the deal completed via an accepted claim rather than a 13th trick. */
  readonly claimedFinish: boolean;
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
  // The thirteenth trick is the same shape as a closed auction — dismissed by
  // hand rather than timed, now that every trick is — except when a claim
  // ended the deal early: accepting awards the remaining tricks directly
  // rather than playing them, so there is no freshly completed trick on the
  // table to look at, and holding for one would show whatever partial trick
  // the claim interrupted. `ClaimResultToast` is what tells the claimant what
  // happened instead.
  if (left === "play" && entered === "complete") {
    return claimedFinish ? null : { kind: "dismissed" };
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

  // A layout effect, not a plain one: `actual` having already moved on is
  // what this render shows unless `held` catches it first, and a plain
  // effect only runs after the browser has painted that unheld frame — a
  // real flash of the phase just left showing the phase just reached, gone
  // as soon as it corrects itself. Layout effects run before paint, so the
  // correction is never visible to begin with.
  useLayoutEffect(() => {
    const left = previous.current;
    previous.current = actual;
    if (left === actual) {
      return;
    }

    const beat = finalBeat({
      claimedFinish: actual === "complete" && session.view.completedTricks.length < 13,
      entered: actual,
      lastDraw,
      left,
      meIsDeclarer,
      theirCardsShowing,
    });
    if (beat === null) {
      // Also clears whatever an *earlier* transition was holding: a shortcut
      // can reach this phase before that hold's own timer ever fires, and its
      // cleanup then cancels that timer without anything else left to clear
      // `held` — the phase this seat is shown would otherwise stick on
      // whatever it left, forever, with the engine already long past it.
      setHeld(null);
      setDismissable(false);
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
          // The deal's last trick still sets `trickAwaitingDismissal` — the
          // completed-trick count that flag watches does not know which
          // trick ends a deal — but this hook's own `release` is what stands
          // in for `onDismissTrick` here, since there is no next trick
          // within *this* deal for the flag to be guarding a lead against.
          // Left uncleared, it stays stuck true into the next deal: that
          // deal's count starts back at 0, which is a decrease rather than
          // the increase the flag watches for, so nothing ever notices and
          // clears it there either — and if the computer is first to act in
          // that new deal, it never will.
          session.dismissTrick();
        }
      : null,
  };
}

/**
 * What just happened to a claim *you* made, the moment it is answered.
 *
 * `view.claim` goes from your own seat back to null on both an accept and a
 * deny, and by then the phase already says which: accepting sets it to
 * "complete" in the same transition, denying leaves it "play". Scoped to
 * claims you made — the responder already knows their own answer the instant
 * they tap it.
 */
function useClaimResult(view: PlayerView): { readonly clear: () => void; readonly result: ClaimResult } {
  const [result, setResult] = useState<ClaimResult>(null);
  const previousClaim = useRef<PlayerId | null>(view.claim);

  useEffect(() => {
    const was = previousClaim.current;
    previousClaim.current = view.claim;
    if (was === view.me && view.claim === null) {
      setResult(view.phase === "complete" ? "accepted" : "denied");
    }
  }, [view.claim, view.me, view.phase]);

  // Stable across renders on purpose: `ClaimResultToast` restarts its dismiss
  // timer whenever this identity changes, and play resuming after a denial
  // re-renders the board often enough that a fresh closure every time kept
  // the timer perpetually reset instead of ever actually firing.
  const clear = useCallback(() => {
    setResult(null);
  }, []);

  return {
    clear,
    result,
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
  tapToSelect,
}: GameBoardProps): React.JSX.Element {
  const [showingScore, setShowingScore] = useState(false);
  const [showingBidding, setShowingBidding] = useState(false);
  const [showingLastTrick, setShowingLastTrick] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [confirmingClaim, setConfirmingClaim] = useState(false);
  const { view } = session;
  const { phase, release } = useShownPhase(session, peeking);
  const claimResult = useClaimResult(view);
  const playable = playableCards(view, phase);
  useGameSounds(session, sound);
  // Captured the instant a card is tapped, before `session.act` removes it
  // from the hand — `PlayPhase` reads this once to aim that card's flight,
  // rather than the fixed point it would otherwise have nothing better than.
  const handOriginRef = useRef<DOMRect | null>(null);

  // The engine's own phase, not the shown one: the toolbar is still on screen
  // for the beat that holds the thirteenth trick after the engine has already
  // moved on, and claiming a deal that is already over is not a real option.
  // `trickAwaitingDismissal` too — offering it the instant a won trick's
  // `toAct` lands is the same early tap `playableCards` guards against, just
  // spent on a claim instead of a lead.
  const claimable =
    view.phase === "play" &&
    view.toAct === view.me &&
    view.claim === null &&
    !session.trickAwaitingDismissal;

  // Once the match is won there is nothing left to lose by going, so the exit
  // stops asking. Mid-rubber it always asks, including between deals — a
  // part-score and two games' history are exactly what walking out throws away.
  const settled = session.rubber.complete;

  return (
    <>
      <TopBar
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
        // The complete screen already shows the scorepad in full, so a
        // button that opens the same thing again is not a real option there.
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

      <ContractBar
        opponentName={session.opponentName}
        phase={phase}
        rubber={session.rubber}
        view={view}
      />

      {peeking && session.opponentHand !== null ? (
        <OpponentPeek cards={session.opponentHand} />
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col">
        {/* Offered only on the screen that ends a match, where "done" is a real
            answer rather than a way out of something unfinished. */}
        <CurrentPhase
          handOriginRef={handOriginRef}
          peeking={peeking}
          phase={phase}
          session={session}
          onDismissTrick={session.dismissTrick}
          onDone={settled && exit !== null ? exit.leave : null}
          onStartPlay={release}
        />
      </main>

      {/* Just above the hand rather than under the top bar — see `PlayToolbar`
          for why. It supplies its own top border as the divider between the
          table above and the footer below, so the footer skips drawing one
          on this phase — see the footer's own class below. */}
      {phase === "play" ? (
        <PlayToolbar
          claimable={claimable}
          lastTrickAvailable={session.lastTrick !== null}
          onClaim={() => {
            setConfirmingClaim(true);
          }}
          onShowBidding={() => {
            setShowingBidding(true);
          }}
          onShowLastTrick={() => {
            setShowingLastTrick(true);
          }}
        />
      ) : null}

      {/* Held open through the shown phase rather than dropped the instant
          `view.hand` empties — the last card is played, and so the hand is
          empty, well before the screen actually leaves "play" for the beat
          that lets the thirteenth trick be seen. Unmounting the footer on the
          engine's own timing rather than the shown one was a layout jump with
          nothing left above to fill the space, ahead of the real transition.

          "No cards yet" is true at the start of the draw and a lie at the end
          of the thirteenth trick, where the hand is empty because all of it
          has been played — so that beat gets a blank placeholder, the same
          height as `Hand`'s own empty state, rather than that text. */}
      {phase === "complete" ? null : (
        <footer className={phase === "play" ? "pt-1" : "border-t border-white/10 pt-1"}>
          {phase !== "draw" && view.hand.length === 0 ? (
            <div style={{ height: HAND_HEIGHT }} />
          ) : (
            <Hand
              cards={view.hand}
              highlight={session.justTaken}
              playable={playable}
              tapToSelect={tapToSelect}
              onPlay={
                playable === null
                  ? null
                  : (card: Card) => {
                      // Read before `session.act`, which is what removes this
                      // very card from the hand — a moment later there is no
                      // element left here to measure.
                      const el = document.querySelector<HTMLElement>(
                        `[data-card-id="${cardId(card)}"]`,
                      );
                      handOriginRef.current = el?.getBoundingClientRect() ?? null;
                      session.act({ type: "play", card });
                      // A harmless no-op unless a resolved trick was still
                      // sitting there — see `playableCards`.
                      session.dismissTrick();
                    }
              }
            />
          )}
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

      {showingBidding ? (
        <BiddingOverlay
          opponentName={session.opponentName}
          view={view}
          onClose={() => {
            setShowingBidding(false);
          }}
        />
      ) : null}

      {showingLastTrick && session.lastTrick !== null ? (
        <LastTrickOverlay
          opponentName={session.opponentName}
          trick={session.lastTrick}
          view={view}
          onClose={() => {
            setShowingLastTrick(false);
          }}
        />
      ) : null}

      <AchievementToast unlocked={session.justUnlocked} onDismiss={session.clearUnlocks} />
      <ClaimResultToast result={claimResult.result} onDismiss={claimResult.clear} />

      {confirmingClaim ? (
        <ClaimConfirm
          onCancel={() => {
            setConfirmingClaim(false);
          }}
          onConfirm={() => {
            session.act({ type: "claim" });
            setConfirmingClaim(false);
          }}
        />
      ) : null}

      {/* `toAct` moves to whoever is deciding the instant a claim is offered,
          so this is exactly "a claim is pending and it is mine to answer" —
          the same seam the rest of the board already reads turns off. */}
      {view.claim !== null && view.toAct === view.me && view.revealedHand !== null ? (
        <ClaimReveal
          cards={view.revealedHand.cards}
          claimantName={session.opponentName}
          onAccept={() => {
            session.act({ type: "claim-response", accept: true });
          }}
          onDeny={() => {
            session.act({ type: "claim-response", accept: false });
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
