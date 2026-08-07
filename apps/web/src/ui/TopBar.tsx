import type { Pair, PlayerView } from "@hb/engine";
import { ContractText } from "./CardText.js";

export interface TopBarProps {
  readonly opponentName: string;
  /** Dev-only shortcut past the phase in progress. Null when it is not on offer. */
  readonly onSkipPhase: (() => void) | null;
  /** Opens the rubber scorepad. Null on the screen that already shows it. */
  readonly onShowScore: (() => void) | null;
  onShowSettings(): void;
  readonly view: PlayerView;
  readonly vulnerable: Pair<boolean>;
}

/**
 * Who is vulnerable, shown from the auction onwards.
 *
 * It doubles the penalty for going down and it is decided before a card is
 * played, so it belongs on screen while there are still bidding decisions to
 * make — not revealed at scoring time.
 */
function Vulnerability({
  opponentName,
  vulnerable,
  view,
}: {
  readonly opponentName: string;
  readonly vulnerable: Pair<boolean>;
  readonly view: PlayerView;
}): React.JSX.Element | null {
  const mine = vulnerable[view.me];
  const theirs = vulnerable[view.opponent];
  if (!mine && !theirs) {
    return null;
  }

  const label = mine && theirs ? "Both vul" : mine ? "You vul" : `${opponentName} vul`;
  return (
    <span className="rounded bg-red-500/25 px-1.5 py-0.5 text-xs font-medium text-red-200">
      {label}
    </span>
  );
}

function Headline({
  opponentName,
  view,
}: {
  readonly opponentName: string;
  readonly view: PlayerView;
}): React.JSX.Element {
  switch (view.phase) {
    case "draw": {
      return <>Draw</>;
    }
    case "auction": {
      return <>Auction</>;
    }
    case "play": {
      const contract = view.contract;
      if (contract === null) {
        return <>Play</>;
      }
      return (
        <>
          <ContractText contract={contract} on="dark" />{" "}
          {contract.declarer === view.me ? "by you" : `by ${opponentName}`}
        </>
      );
    }
    default: {
      return <>Deal complete</>;
    }
  }
}

/**
 * Only the trick count earns a place here. The stock count lives on the deck
 * itself, and how many cards you hold is answered by looking at your hand —
 * during the auction it is always 13, which is no answer at all.
 */
function detail(view: PlayerView): string | null {
  if (view.phase === "play" || view.phase === "complete") {
    return `Tricks  ${view.tricksWon[view.me]} – ${view.tricksWon[view.opponent]}`;
  }
  return null;
}

export function TopBar({
  onShowScore,
  onShowSettings,
  onSkipPhase,
  opponentName,
  view,
  vulnerable,
}: TopBarProps): React.JSX.Element {
  const right = detail(view);

  return (
    <header className="flex items-baseline justify-between gap-2 border-b border-white/10 px-4 py-2">
      <h1 className="text-base font-semibold text-white">
        <Headline opponentName={opponentName} view={view} />
      </h1>
      <span className="flex-1" />
      {view.phase === "draw" ? null : (
        <Vulnerability opponentName={opponentName} vulnerable={vulnerable} view={view} />
      )}
      {right === null ? null : <p className="text-sm tabular-nums text-white/60">{right}</p>}
      {onShowScore === null ? null : (
        <button
          type="button"
          aria-label="Show the rubber score"
          className="rounded border border-white/25 px-2 py-0.5 text-xs whitespace-nowrap text-white/70"
          onClick={onShowScore}
        >
          score
        </button>
      )}

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

      {/* Last, so it keeps the same place whatever else the bar is showing. */}
      <button
        type="button"
        aria-label="Settings"
        className="rounded border border-white/25 px-1.5 py-0.5 text-sm leading-5 text-white/70"
        onClick={onShowSettings}
      >
        ⚙
      </button>
    </header>
  );
}
