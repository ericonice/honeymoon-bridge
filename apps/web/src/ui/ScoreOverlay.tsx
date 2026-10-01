import type { MatchFormat, MatchStanding, Pair, PlayerView } from "@hb/engine";
import type { BoardReviewing } from "../game/boardReview.js";
import { useSwipeBack } from "../game/swipeBack.js";
import { BackButton } from "./BackButton.js";
import { FieldPad } from "./FieldPad.js";
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
 *
 * **A page rather than a panel, which is a change and was asked for by name.** Every
 * argument above is about *reachability mid-deal* and none of it is about the table
 * staying visible behind — a page is reached from the same tap and left with the
 * same gesture. What decided it is that this drills into one: a board is a page, and
 * a panel that opens a page is the kind of inconsistency a reader notices before
 * they can say why.
 *
 * It is also the wrong content for a panel on its own terms. `Overlay` is for a
 * glance with what you were doing still behind it, which the bidding record and the
 * last trick are; a scorepad, or a list of a session's boards, is a page of the same
 * kind as the record screen. Those two stay panels, and the line between them is
 * the one `Overlay` already draws.
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
  useSwipeBack(onClose);

  return (
    <div className="safe-inset absolute inset-0 z-30 flex flex-col bg-table-dark/97">
      <div className="px-4 pt-4">
        <BackButton onBack={onClose} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-5 pt-2 pb-6">
        <div className="flex w-full max-w-sm flex-col gap-3">
          <h1 className="text-lg font-semibold">Score</h1>
          {standing.kind === "field" ? (
            <FieldPad
              me={view.me}
              opponentName={opponentName}
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
          <p className="text-xs text-white/50">
        {/* A board in the two duplicate formats, a deal in a rubber — the unit the
            reader is being told about, in the word that format uses for it. */}
            {vulnerabilityLine(
              view,
              vulnerable,
              opponentName,
              standing.kind === "rubber" ? "deal" : "board",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
