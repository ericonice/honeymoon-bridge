import { legalActionsForView } from "@hb/engine";
import type { Call, Card, PlayerView } from "@hb/engine";
import { useState } from "react";
import { readDevTools, writeDevTools } from "./game/devTools.js";
import { useGameSession } from "./game/useGameSession.js";
import type { GameSession } from "./game/useGameSession.js";
import { AuctionPhase } from "./ui/AuctionPhase.js";
import { DealComplete } from "./ui/DealComplete.js";
import { DrawPhase } from "./ui/DrawPhase.js";
import { Hand } from "./ui/Hand.js";
import { OpponentPeek } from "./ui/OpponentPeek.js";
import { PlayPhase } from "./ui/PlayPhase.js";
import { ScoreOverlay } from "./ui/ScoreOverlay.js";
import { SettingsOverlay } from "./ui/SettingsOverlay.js";
import { TopBar } from "./ui/TopBar.js";

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
  session,
}: {
  readonly peeking: boolean;
  readonly session: GameSession;
}): React.JSX.Element {
  const { history, lastDraw, lastTrick, nextDeal, rubber, score, view, vulnerable } = session;

  switch (view.phase) {
    case "draw": {
      return (
        <DrawPhase
          lastDraw={lastDraw}
          lastOwnDraw={session.lastOwnDraw}
          peekLastDraw={peeking ? session.opponentLastDraw : null}
          peekPending={peeking ? session.opponentPending : null}
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
          view={view}
          onCall={(call: Call) => {
            session.act({ type: "call", call });
          }}
        />
      );
    }
    case "play": {
      return <PlayPhase lastTrick={lastTrick} view={view} />;
    }
    default: {
      return (
        <DealComplete
          history={history}
          rubber={rubber}
          score={score}
          view={view}
          vulnerable={vulnerable}
          onNextDeal={nextDeal}
        />
      );
    }
  }
}

export function App(): React.JSX.Element {
  const session = useGameSession();
  const { view } = session;
  const playable = playableCards(view);
  const [showingScore, setShowingScore] = useState(false);
  const [showingSettings, setShowingSettings] = useState(false);
  const [peeking, setPeeking] = useState(false);
  // Read once, then owned here so Settings can change it without a reload.
  const [devTools, setDevTools] = useState(readDevTools);

  return (
    // A fixed full-height frame, sized in dvh so the layout does not jump as
    // Safari's URL bar hides, and inset so nothing sits under the notch or the
    // home indicator. Each region scrolls on its own; the page never does.
    //
    // Capped at a phone's width and centred: every screen here is laid out for
    // a hand holding a phone, and stretching that across a desktop monitor
    // makes rows of buttons absurdly wide rather than usefully bigger. On a
    // phone the cap never binds.
    <div
      className="relative mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-felt text-white"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
    >
      <TopBar
        view={view}
        vulnerable={session.vulnerable}
        // The score screen already shows the scorepad in full.
        onShowScore={
          view.phase === "complete"
            ? null
            : () => {
                setShowingScore(true);
              }
        }
        onSkipPhase={devTools && view.phase !== "complete" ? session.skipPhase : null}
        onShowSettings={() => {
          setShowingSettings(true);
        }}
      />

      {import.meta.env.DEV && peeking && session.opponentHand !== null ? (
        <OpponentPeek cards={session.opponentHand} />
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col">
        <CurrentPhase peeking={peeking} session={session} />
      </main>

      {view.phase === "complete" ? null : (
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
          rubber={session.rubber}
          view={view}
          vulnerable={session.vulnerable}
          onClose={() => {
            setShowingScore(false);
          }}
        />
      ) : null}

      {showingSettings ? (
        <SettingsOverlay
          devTools={devTools}
          onClose={() => {
            setShowingSettings(false);
          }}
          onDevToolsChange={(enabled) => {
            writeDevTools(enabled);
            setDevTools(enabled);
          }}
          peeking={peeking}
          onPeekingChange={setPeeking}
        />
      ) : null}
    </div>
  );
}
