import { legalActionsForView, revealsUnseenCard } from "@hb/engine";
import type { Call, Card, DealPhase, PlayerView } from "@hb/engine";
import { useEffect, useRef, useState } from "react";
import { drawTurnDuration } from "../game/timing.js";
import type { GameSession } from "../game/session.js";
import { AuctionPhase } from "./AuctionPhase.js";
import { DealComplete } from "./DealComplete.js";
import { DrawPhase } from "./DrawPhase.js";
import { Hand } from "./Hand.js";
import { OpponentPeek } from "./OpponentPeek.js";
import { PlayPhase } from "./PlayPhase.js";
import { ScoreOverlay } from "./ScoreOverlay.js";
import { TopBar } from "./TopBar.js";

export interface GameBoardProps {
  readonly devTools: boolean;
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
  peeking,
  phase,
  session,
}: {
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
          rubber={rubber}
          score={score}
          view={view}
          vulnerable={vulnerable}
          waitingToContinue={session.waitingToContinue}
          onNextDeal={nextDeal}
        />
      );
    }
  }
}

/**
 * The board, for any session.
 *
 * Knows nothing about where the game is running: against the computer it is fed
 * by a reducer in this tab, over a network by a Durable Object. That the same
 * component serves both is the test of whether `GameSession` was drawn in the
 * right place.
 */
/**
 * The phase to *show*, which lags the engine at the end of the draw.
 *
 * The engine turns the twenty-sixth draw turn straight into the auction, so the
 * last turn of the phase was the one turn you never got to watch — and on a
 * keep, that meant never seeing the card 2 the rules require you to look at.
 * Holding the draw screen for the length of its own animation gives the final
 * turn the same ending as the twenty-five before it.
 */
function useShownPhase(session: GameSession): DealPhase {
  const actual = session.view.phase;
  const [held, setHeld] = useState(false);
  const previous = useRef(actual);
  const { lastDraw } = session;

  useEffect(() => {
    const wasDrawing = previous.current === "draw";
    previous.current = actual;
    if (!wasDrawing || actual === "draw" || lastDraw === null) {
      return;
    }

    setHeld(true);
    const timer = setTimeout(
      () => {
        setHeld(false);
      },
      drawTurnDuration(lastDraw.taken !== null, revealsUnseenCard(lastDraw)),
    );
    return () => {
      clearTimeout(timer);
    };
    // Only the transition matters; re-running on anything else would reopen a
    // phase the player has already left.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual]);

  return held ? "draw" : actual;
}

export function GameBoard({
  devTools,
  onShowSettings,
  peeking,
  session,
}: GameBoardProps): React.JSX.Element {
  const [showingScore, setShowingScore] = useState(false);
  const { view } = session;
  const phase = useShownPhase(session);
  const playable = playableCards(view);

  return (
    <>
      <TopBar
        opponentName={session.opponentName}
        view={view}
        // The score screen already shows the scorepad in full.
        onShowScore={
          view.phase === "complete"
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
        <CurrentPhase peeking={peeking} phase={phase} session={session} />
      </main>

      {phase === "complete" ? null : (
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
    </>
  );
}
