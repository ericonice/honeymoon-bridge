import type { DealPhase, PlayerView } from "@hb/engine";
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
  readonly view: PlayerView;
}

/**
 * Just the phase, during the draw and the auction. Once a contract exists it
 * has its own strip below the bar — see `ContractBar` — so there is nothing
 * left for a headline here to add.
 */
function Headline({ phase }: { readonly phase: DealPhase }): React.JSX.Element {
  switch (phase) {
    case "draw": {
      return <>Draw</>;
    }
    case "auction": {
      return <>Auction</>;
    }
    case "play": {
      return <>Play</>;
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
        <Headline phase={phase} />
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
