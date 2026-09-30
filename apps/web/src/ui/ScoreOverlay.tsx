import type { MatchFormat, MatchStanding, Pair, PlayerView } from "@hb/engine";
import type { BoardReviewing } from "../game/boardReview.js";
import { FieldPad } from "./FieldPad.js";
import { Overlay } from "./Overlay.js";
import { Scorepad } from "./Scorepad.js";
import { SessionPad } from "./SessionPad.js";

export interface ScoreOverlayProps {
  /** What is being played, which the standing cannot say for a two-game match. */
  readonly format: MatchFormat;
  readonly opponentName: string;
  /** Looking a board up again — see `useBoardReviews`. */
  readonly reviews: BoardReviewing;
  readonly standing: MatchStanding;
  readonly view: PlayerView;
  readonly vulnerable: Pair<boolean>;
  onClose(): void;
}

/**
 * Who is vulnerable on the deal being played, and **it has to say which deal**.
 *
 * It read "Neither side vulnerable" and sat under the pad, which was unambiguous for
 * as long as nothing else on the panel mentioned vulnerability. A Doop pad now tags
 * every board with the terms *it* was played at, so a bare sentence directly beneath
 * a list of them reads as a statement about the list — and contradicts it, since the
 * board on the table need not match any of them.
 *
 * Named rather than moved. Putting it above the pad would leave the same ambiguity
 * in a different place; what the reader is missing is not where the line sits but
 * what it is about.
 */
function vulnerabilityLine(
  view: PlayerView,
  vulnerable: Pair<boolean>,
  opponentName: string,
  unit: string,
): string {
  const mine = vulnerable[view.me];
  const theirs = vulnerable[view.opponent];

  if (mine && theirs) {
    return `Both sides vulnerable on this ${unit}`;
  }
  if (mine) {
    return `You are vulnerable on this ${unit}`;
  }
  if (theirs) {
    return `${opponentName} is vulnerable on this ${unit}`;
  }
  return `Neither side vulnerable on this ${unit}`;
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
  format,
  opponentName,
  reviews,
  standing,
  view,
  vulnerable,
}: ScoreOverlayProps): React.JSX.Element {
  return (
    <Overlay title="Score" onClose={onClose}>
      {standing.kind === "field" ? (
        <FieldPad
          me={view.me}
          reviews={reviews}
          summary={standing.summary}
        />
      ) : standing.kind === "duplicate" ? (
        <SessionPad summary={standing.summary} view={view} />
      ) : (
        <Scorepad
        format={format}
        history={standing.history}
        opponentName={opponentName}
        previous={standing.previous}
        previousPoints={standing.previousPoints}
        rubber={standing.rubber}
        view={view}
      />
      )}
      <p className="pt-3 text-xs text-white/50">
        {/* A board in the two duplicate formats, a deal in a rubber — the unit the
            reader is being told about, in the word that format uses for it. */}
        {vulnerabilityLine(
          view,
          vulnerable,
          opponentName,
          standing.kind === "rubber" ? "deal" : "board",
        )}
      </p>
    </Overlay>
  );
}
