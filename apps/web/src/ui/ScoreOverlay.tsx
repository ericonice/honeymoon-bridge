import type { Pair, PlayerView, RubberState } from "@hb/engine";
import type { DealRecord } from "../game/session.js";
import { Overlay } from "./Overlay.js";
import { Scorepad } from "./Scorepad.js";

export interface ScoreOverlayProps {
  readonly history: readonly DealRecord[];
  readonly opponentName: string;
  /** Both sides' ratings, either of which is null until something has said. */
  readonly ratings: { readonly mine: number | null; readonly opponent: number | null };
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
/**
 * Both sides' ratings, laid out in the scorepad's own columns.
 *
 * This is where a rating belongs more than beside a seat: the overlay is
 * *about* where the two players stand relative to each other, and a rating is
 * the one figure on it that is not relative to this rubber. Aligned under the
 * columns rather than written as a sentence so the eye reads down — the number
 * under "You" is yours — which is the same reason the scorepad has columns at
 * all.
 *
 * Rendered only when both are known. One rating alone invites comparing it with
 * the blank beside it, and the whole discipline around `botAnchor` returning
 * null is that a rating nobody can check is worse than none: half a comparison
 * is exactly that.
 */
function Ratings({
  ratings,
}: {
  readonly ratings: { readonly mine: number | null; readonly opponent: number | null };
}): React.JSX.Element | null {
  if (ratings.mine === null || ratings.opponent === null) {
    return null;
  }
  return (
    <div className="flex justify-end gap-2 pt-2 text-xs text-white/45">
      <span className="w-16 text-right tabular-nums">{ratings.mine}</span>
      <span className="w-16 text-right tabular-nums">{ratings.opponent}</span>
    </div>
  );
}

export function ScoreOverlay({
  history,
  onClose,
  opponentName,
  ratings,
  rubber,
  view,
  vulnerable,
}: ScoreOverlayProps): React.JSX.Element {
  return (
    <Overlay title="Score" onClose={onClose}>
      <Scorepad history={history} opponentName={opponentName} rubber={rubber} view={view} />
      <Ratings ratings={ratings} />
      <p className="pt-3 text-xs text-white/50">{vulnerabilityLine(view, vulnerable, opponentName)}</p>
    </Overlay>
  );
}
