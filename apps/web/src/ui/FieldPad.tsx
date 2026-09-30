import { boardPercentageOf } from "@hb/engine";
import type { FieldResult, FieldSummary, PlayerId } from "@hb/engine";
import type { BoardReviewing } from "../game/boardReview.js";
import { reviewKeyOf } from "../game/boardReview.js";
import { BoardDetail } from "./BoardDetail.js";
import { ContractText } from "./CardText.js";
import { Role, Tags } from "./Traveller.js";
import { mineOn, signed } from "./fieldText.js";
import { ChevronRightIcon } from "./icons.js";

/**
 * The scorepad of a Doop session: a board a row, each opening into what happened on
 * it.
 *
 * Not a table of figures. §1.8a ranks you against the results recorded on each
 * board, so what a reader eventually needs per board is the **traveller** — every
 * result on it, yours among them — and the hands and bidding behind that. A grid
 * with one row a board could only ever show the figure, not what made it.
 *
 * **One way in, not two.** This was a list whose rows expanded a traveller in place,
 * with a button inside that expansion pushing a second panel for the hands — two
 * disclosure models stacked, for one question, and the push threw away which row had
 * been open, so coming back landed on a collapsed list scrolled to the top. Reported
 * as the navigation being odd, which it was.
 *
 * The argument against the accordion was already written in this file, as the reason
 * only one row could be open at a time: *a panel breaks the alignment of the rows
 * around it, and that alignment is what makes the list scannable*. Read once more
 * that is not an argument for one panel — it is an argument for none. So a row drills
 * straight into the board, which is the ordinary shape of a list on a phone, and
 * `BoardReview` carries everything about it.
 *
 * Nothing is lost by the traveller leaving the list: an expanded row shoved every
 * board below it down the screen, so it was never being read beside its neighbours.
 */
export function FieldPad({
  latest = false,
  me,
  opponentName,
  reviews,
  summary,
}: {
  /**
   * Only the board just played, for the screen between deals.
   *
   * A reveal is about the hand that just finished, and a list of every earlier board
   * buries that. The session's own figures are on the strip directly above it, so the
   * foot would be saying them twice as well.
   *
   * The whole session is what the Score button opens, which is where a reader is
   * asking about the session rather than about a deal.
   */
  readonly latest?: boolean;
  readonly me: PlayerId;
  /** Needed by the board the reveal draws in full — see `BoardDetail`. */
  readonly opponentName: string;
  /** Looking a board up again — see `useBoardReviews`. */
  readonly reviews: BoardReviewing;
  readonly summary: FieldSummary;
}): React.JSX.Element {
  // The reveal is about the board that just finished, so it draws that board
  // outright — there is nothing to choose between and nothing to drill into.
  //
  // **The same component the score pad opens**, rather than a traveller with a
  // "Hands and bidding" button under it. That button opened a panel that starts on
  // the field, so it promised the deal and landed you on what was already on screen
  // — and it made the board you just played the one board reached differently from
  // every other. Keyed on the board so a new one opens on the field again: which tab
  // you left the last board on is not a preference, it is where that board's own
  // reading finished.
  if (latest) {
    const at = summary.results.length - 1;
    const result = summary.results[at];
    return result === undefined ? (
      <div />
    ) : (
      <BoardDetail
        key={reviewKeyOf(result.board, me)}
        at={at}
        me={me}
        opponentName={opponentName}
        result={result}
        review={reviews.kept.get(reviewKeyOf(result.board, me)) ?? null}
      />
    );
  }

  return (
    <div className="flex flex-col text-sm">
      <p className="pb-2 text-xs text-white/45">
        Each board once, ranked against everybody who has held these cards. Tap a board
        for the whole traveller and the hands.
      </p>
      {summary.results.map((result, at) => (
        <BoardRow
          key={reviewKeyOf(result.board, me)}
          at={at}
          me={me}
          result={result}
          reviews={reviews}
        />
      ))}
      <Foot summary={summary} />
    </div>
  );
}

/**
 * One board: what you did with it, where it placed, and the way in.
 *
 * A real `button` with a chevron rather than a decorated row, for the reason the
 * record screen settled on the same shape: otherwise the keyboard and a screen
 * reader have no way to know there is anywhere to go.
 */
function BoardRow({
  at,
  me,
  result,
  reviews,
}: {
  readonly at: number;
  readonly me: PlayerId;
  readonly result: FieldResult;
  readonly reviews: BoardReviewing;
}): React.JSX.Element {
  const placed = boardPercentageOf(result, me);
  const mine = mineOn(result, me);
  return (
    <button
      type="button"
      className="flex w-full items-baseline gap-2 border-b border-white/7 py-2 text-left last:border-b-0"
      onClick={() => {
        reviews.open(at);
      }}
    >
      <span className="w-16 shrink-0 text-xs text-white/45">Board {at + 1}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1.5">
        {mine.contract === null ? (
          <span className="text-xs text-white/45">passed out</span>
        ) : (
          <>
            <Role role={mine.role} />
            <ContractText contract={mine.contract} on="dark" />
            <span className="text-xs text-white/45">{mine.mark}</span>
            <Tags tags={mine.tags} />
          </>
        )}
      </span>
      <span className="shrink-0 tabular-nums text-white/60">{signed(mine.points)}</span>
      <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
        {placed === null ? "—" : `${Math.round(placed)}%`}
      </span>
      <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 self-center text-white/30" />
    </button>
  );
}

function Foot({ summary }: { readonly summary: FieldSummary }): React.JSX.Element {
  const human = summary.humanPercentage;
  return (
    <div className="border-t border-white/15 pt-2 text-sm">
      <p className="flex items-baseline justify-between">
        {/* The count only when it is not the whole story — see `waitingFor` in
            `ContractBar`. "4 of 4 ranked" is a fraction a reader has to interpret to
            learn that nothing is wrong. */}
        <span className="text-white/55">
          Overall
          {summary.boardsRanked < summary.boardsPlayed
            ? ` · ${summary.boardsPlayed - summary.boardsRanked} not back yet`
            : ""}
        </span>
        <span className="font-semibold tabular-nums">
          {summary.percentage === null ? "—" : `${Math.round(summary.percentage)}%`}
        </span>
      </p>
      {/* Absent rather than nought until somebody else has played one of these boards:
          §1.8a's whole point is that a figure against machine runs and a figure against
          people are different claims, and a zero here would be the wrong one. */}
      {human === null ? null : (
        <p className="flex items-baseline justify-between text-white/55">
          <span>Against people</span>
          <span className="tabular-nums">{Math.round(human)}%</span>
        </p>
      )}
    </div>
  );
}
