import type { Pair, PlayerView, RubberState } from "@hb/engine";
import type { DealRecord } from "../game/session.js";
import { Scorepad } from "./Scorepad.js";

export interface ScoreOverlayProps {
  readonly history: readonly DealRecord[];
  readonly opponentName: string;
  readonly rubber: RubberState;
  readonly view: PlayerView;
  readonly vulnerable: Pair<boolean>;
  onClose(): void;
}

function vulnerabilityLine(view: PlayerView, vulnerable: Pair<boolean>, opponentName: string): string {
  const mine = vulnerable[view.me];
  const theirs = vulnerable[view.opponent];

  if (mine && theirs) {
    return "Both sides vulnerable";
  }
  if (mine) {
    return "You are vulnerable";
  }
  if (theirs) {
    return `${opponentName} is vulnerable`;
  }
  return "Neither side vulnerable";
}

/**
 * The rubber so far, reachable from any phase.
 *
 * A part-score changes what you should be bidding — at 60 below the line, two
 * of a minor is a game — and it is decided several deals before the auction
 * where it matters. Leaving it visible only between deals means asking the
 * player to carry it in their head, which is not the kind of memory this game
 * is trying to test.
 */
export function ScoreOverlay({
  history,
  onClose,
  opponentName,
  rubber,
  view,
  vulnerable,
}: ScoreOverlayProps): React.JSX.Element {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-table-dark/97">
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 py-6">
        <Scorepad history={history} opponentName={opponentName} rubber={rubber} view={view} />
        <p className="w-full max-w-sm pt-3 text-xs text-white/50">
          {vulnerabilityLine(view, vulnerable, opponentName)}
        </p>
      </div>
      <div className="px-5 pb-5">
        <button
          type="button"
          className="w-full rounded-xl bg-white px-4 py-3.5 text-base font-semibold text-stone-900"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
