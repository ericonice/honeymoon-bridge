import type { DealPhase, PlayerView } from "@hb/engine";
import { ContractText } from "./CardText.js";
import { SettingsIcon } from "./icons.js";

export interface TopBarProps {
  /**
   * The phase being *shown*, which is not always the one the engine is in — the
   * board holds the last turn of the draw and of the play on screen after the
   * engine has moved on. The bar has to lag with it, or it announces the
   * scorepad over a trick still being collected.
   */
  readonly phase: DealPhase;
  /**
   * Gives up the match. Null when there is no way out of this one.
   *
   * Top left, where a phone puts the way back, because leaving is the inverse
   * of arriving rather than a preference — which is what it read as while it
   * sat among the toggles in Settings, and why nobody found it there.
   */
  readonly onLeave: (() => void) | null;
  /** Dev-only shortcut past the phase in progress. Null when it is not on offer. */
  readonly onSkipPhase: (() => void) | null;
  onShowSettings(): void;
  /** Whose contract it is, when it is not yours. */
  readonly opponentName: string;
  readonly view: PlayerView;
}

/**
 * The phase — except during play, where it is the contract.
 *
 * **"Play" is the one headline here that tells a reader nothing they do not already
 * know**, and it occupies the largest, most fixed piece of text on the screen. The
 * contract is the thing a player actually hunts for mid-hand, and this is the only
 * place it can go that is both prominent and free.
 *
 * It lived in the score strip before, which was wrong twice: that strip is the
 * *score*, and it had no contract during the draw or the auction, so it grew a row
 * when play started and pushed the whole board down. It then spent a build on the
 * declarer's own `SeatLabel`, which is truer — whose contract it is needs no words
 * there — but that label is deliberately the quietest thing on the board so it will
 * not compete with the turn dot, and something you go looking for should not be in
 * the quietest element on screen.
 *
 * The headline already changes with the state, so this is not a new kind of thing
 * for it to do: it reads "Deal complete" the moment a deal ends.
 */
function Headline({
  opponentName,
  phase,
  view,
}: {
  readonly opponentName: string;
  readonly phase: DealPhase;
  readonly view: PlayerView;
}): React.JSX.Element {
  switch (phase) {
    case "draw": {
      return <>Draw</>;
    }
    case "auction": {
      return <>Auction</>;
    }
    case "play": {
      // A passed-out deal reaches "play" with no contract and goes straight on, so
      // the phase word is still the honest answer for the beat that lasts.
      return view.contract === null ? (
        <>Play</>
      ) : (
        <>
          <ContractText contract={view.contract} on="dark" />{" "}
          <span className="font-normal text-white/55">
            by {view.contract.declarer === view.me ? "you" : opponentName}
          </span>
        </>
      );
    }
    default: {
      return <>Deal complete</>;
    }
  }
}

export function TopBar({
  onLeave,
  onShowSettings,
  onSkipPhase,
  opponentName,
  phase,
  view,
}: TopBarProps): React.JSX.Element {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
      {onLeave === null ? null : (
        <button
          type="button"
          aria-label="Leave"
          className="-ml-2 px-2 text-xl leading-4 text-white/70"
          onClick={onLeave}
        >
          ‹
        </button>
      )}
      <h1 className="min-w-0 truncate text-base font-semibold text-white">
        <Headline opponentName={opponentName} phase={phase} view={view} />
      </h1>
      <span className="flex-1" />

      {/* Deliberately present in a deployed build and switched off by default —
          see `readDevTools`. The caller decides whether it is on offer. */}
      {onSkipPhase !== null ? (
        <button
          type="button"
          className="rounded border border-amber-300/40 px-2 py-0.5 text-xs whitespace-nowrap text-amber-200/80"
          onClick={onSkipPhase}
        >
          skip {view.phase}
        </button>
      ) : null}

      <button
        type="button"
        aria-label="Settings"
        className="rounded border border-white/25 px-1.5 py-0.5 text-white/70"
        onClick={onShowSettings}
      >
        <SettingsIcon className="h-3.5 w-3.5" />
      </button>
    </header>
  );
}
