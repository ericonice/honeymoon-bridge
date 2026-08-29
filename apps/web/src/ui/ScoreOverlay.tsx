import type { MatchStanding, Pair, PlayerView } from "@hb/engine";
import { Overlay } from "./Overlay.js";
import { Scorepad } from "./Scorepad.js";
import { SessionPad } from "./SessionPad.js";

export interface ScoreOverlayProps {
  readonly opponentName: string;
  readonly standing: MatchStanding;
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
 * The match so far, reachable from any phase.
 *
 * A part-score changes what you should be bidding — at 60 below the line, two
 * of a minor is a game — and it is decided several deals before the auction
 * where it matters. Leaving it visible only between deals means asking the
 * player to carry it in their head, which is not the kind of memory this game
 * is trying to test.
 *
 * A session has no part-score, and it is reachable for the other half of the same
 * reason: what a board is worth is settled boards behind you, and how far ahead
 * you are is what decides whether the board in front is worth a risk.
 */
export function ScoreOverlay({
  onClose,
  opponentName,
  standing,
  view,
  vulnerable,
}: ScoreOverlayProps): React.JSX.Element {
  return (
    <Overlay title="Score" onClose={onClose}>
      {standing.kind === "duplicate" ? (
        <SessionPad summary={standing.summary} view={view} />
      ) : (
        <Scorepad
        history={standing.history}
        opponentName={opponentName}
        previous={standing.previous}
        rubber={standing.rubber}
        view={view}
      />
      )}
      <p className="pt-3 text-xs text-white/50">{vulnerabilityLine(view, vulnerable, opponentName)}</p>
    </Overlay>
  );
}
