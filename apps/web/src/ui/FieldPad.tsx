import { boardPercentageOf, honorsOn, humanPercentageOf, netFor } from "@hb/engine";
import type { Contract, FieldResult, FieldSummary, Pair, PlayerId } from "@hb/engine";
import { useState } from "react";
import type { BoardReviewing } from "../game/boardReview.js";
import { reviewKeyOf } from "../game/boardReview.js";
import { ContractText } from "./CardText.js";
import { contractTags, resultOf, signed, vulnerableFrom } from "./fieldText.js";

/**
 * The scorepad of a Doop session: a board at a time, you among everybody else.
 *
 * Not a table of boards. §1.8a ranks you against the results recorded on each board,
 * so what a reader needs per board is the **traveller** — every result on it, yours
 * among them — and a grid with one row a board could only ever show the figure, not
 * what made it. A session of eight boards is eight small travellers, which is exactly
 * how a duplicate player reads a session.
 *
 * **The opposition is said once per board rather than tagged per row.** Every entry
 * on a board faced the same thing in solo play, so a per-row tag would imply it
 * varies and invite the reader to work out which rows are the comparable ones. What
 * does vary is who held the cards, and that is what each row names.
 *
 * **Vulnerability and honors are tagged per row, and that is not a contradiction of
 * the line above** — see `contractTags`. Both qualify the *contract* rather than the
 * board: a traveller's rows need not all have declared, so vulnerability really can
 * differ between them, and honors go to whoever held them.
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
   * A reveal is about the hand that just finished, and redrawing every earlier board
   * under it buries that in a scroll — by the fourth board the thing you are looking
   * for is four travellers down. The session's own figures are on the strip directly
   * above it, so the foot would be saying them twice as well.
   *
   * The whole session is what the Score button opens, which is where a reader is
   * asking about the session rather than about a deal.
   */
  readonly latest?: boolean;
  readonly me: PlayerId;
  readonly opponentName: string;
  /** Looking a board up again — see `useBoardReviews`. */
  readonly reviews: BoardReviewing;
  readonly summary: FieldSummary;
}): React.JSX.Element {
  // **Every row shut, including the one just played.** Opening the last board on mount
  // was what made showing the whole session at the end cost nothing — the final deal
  // was otherwise the one board of the sitting whose traveller you never saw. The
  // reveal stages that traveller on its own now, so having it open here as well drew
  // the same thing twice in consecutive screens.
  const [open, setOpen] = useState<string | null>(null);

  // The reveal is about the board that just finished, so it draws that one traveller
  // outright — there is nothing to choose between and nothing to open.
  if (latest) {
    const at = summary.results.length - 1;
    const result = summary.results[at];
    return (
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-xs text-white/45">
          Everybody here faced the same offers and kept their own cards.
        </p>
        {result === undefined ? null : (
          <>
            <Traveller at={at} me={me} result={result} />
            {/* The board just played is exactly the one somebody asks this of — the
                placing has just landed and the hands are a tap behind it. */}
            <ReviewButton at={at} me={me} result={result} reviews={reviews} />
          </>
        )}
      </div>
    );
  }

  /**
   * The session is a **row a board, opening into its traveller** — the shape the
   * record screen's opponent rows already use, and for the same reason.
   *
   * Eight travellers stacked is eight or nine rows apiece, so the session pad was
   * seventy rows of which the reader wanted one line each: what they did on a board
   * and where it placed. The detail is worth having and is worth a tap rather than a
   * scroll.
   *
   * One open at a time, because a panel breaks the alignment of the rows around it
   * and that alignment is what makes the list scannable. A real `button` with
   * `aria-expanded` rather than a decorated `div`, for the reason the record screen
   * settled: otherwise the keyboard and a screen reader have no way to know the panel
   * is there.
   */
  return (
    <div className="flex flex-col text-sm">
      <p className="pb-2 text-xs text-white/45">
        Each board once, ranked against everybody who has held these cards. Tap a board
        to see what they all did with it.
      </p>
      {summary.results.map((result, at) => (
        <BoardRow
          key={reviewKeyOf(result.board, me)}
          at={at}
          me={me}
          open={open === reviewKeyOf(result.board, me)}
          result={result}
          reviews={reviews}
          onToggle={() => {
            const key = reviewKeyOf(result.board, me);
            setOpen(open === key ? null : key);
          }}
        />
      ))}
      <Foot summary={summary} />
    </div>
  );
}

/**
 * The way back into a board's hands, where there are any kept.
 *
 * Absent rather than disabled when there are none, which is the honest answer for
 * the two cases that produce it: a board finished by an accepted **claim** ends with
 * cards unplayed and never had a full thirteen to show, and a session carried across
 * a reload has nothing kept from before it. A control that cannot do anything is
 * worse than no control, because it promises the screen exists.
 */
function ReviewButton({
  at,
  me,
  result,
  reviews,
}: {
  readonly at: number;
  readonly me: PlayerId;
  readonly result: FieldResult;
  readonly reviews: BoardReviewing;
}): React.JSX.Element | null {
  if (!reviews.kept.has(reviewKeyOf(result.board, me))) {
    return null;
  }
  return (
    <button
      type="button"
      className="mt-2.5 block w-full rounded-lg border border-white/25 py-2 text-center text-[0.8rem] text-white/80"
      onClick={() => {
        reviews.open(at);
      }}
    >
      Hands and bidding
    </button>
  );
}

/** One board, collapsed: what you did with it and where it placed. */
function BoardRow({
  at,
  me,
  onToggle,
  open,
  result,
  reviews,
}: {
  readonly at: number;
  readonly me: PlayerId;
  onToggle(): void;
  readonly open: boolean;
  readonly result: FieldResult;
  readonly reviews: BoardReviewing;
}): React.JSX.Element {
  const placed = boardPercentageOf(result, me);
  const mine = mineOn(result, me);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        className={`flex w-full items-baseline gap-2 border-b border-white/7 py-2 text-left last:border-b-0 ${
          open ? "border-b-transparent bg-white/5" : ""
        }`}
        onClick={onToggle}
      >
        <span className="w-16 shrink-0 text-xs text-white/45">Board {at + 1}</span>
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1.5">
          {mine.contract === null ? (
            <span className="text-xs text-white/45">passed out</span>
          ) : (
            <>
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
      </button>
      {open ? (
        <div className="border-b border-white/7 bg-white/5 px-2 pb-3">
          <Traveller at={at} me={me} result={result} />
          <ReviewButton at={at} me={me} result={result} reviews={reviews} />
        </div>
      ) : null}
    </>
  );
}

/**
 * A board's traveller: every result on it, **best first, with yours in its place**.
 *
 * Ordered by score rather than by who played, because the traveller exists to show
 * where you came — and a list that pins your own line to the top answers a different
 * question, "what did I do", which the row above it already answered. Reading down
 * the order and finding yourself is the point.
 *
 * Sorted descending on the net, which is the same quantity the matchpoints rank, so
 * the order on screen and the percentage beside it cannot disagree. Ties keep the
 * order they arrived in — a stable sort — so two identical scores sit together
 * instead of swapping about between renders.
 */
function Traveller({
  at,
  me,
  result,
}: {
  readonly at: number;
  readonly me: PlayerId;
  readonly result: FieldResult;
}): React.JSX.Element {
  const placed = boardPercentageOf(result, me);
  const mine: Line = { ...mineOn(result, me), mine: true, note: null, who: "you" };
  // A recorded entry is stored from its own stream's side — its declarer and its
  // tricks both name that row's own player as 0 — so its terms have to be read the
  // same way round, which is what `vulnerableFrom` does to a board's own pair.
  const theirTerms = vulnerableFrom(result.board.vulnerable, me);
  const others: readonly Line[] = (result.field[me] ?? []).map((entry) => ({
    ...describe({
      contract: entry.contract,
      net: entry.points,
      seat: 0,
      tricks: entry.tricks,
      vulnerable: theirTerms,
    }),
    mine: false,
    note: entry.kind === "table" ? "played a person" : null,
    who: entry.who,
  }));
  const lines = [mine, ...others].sort((one, two) => two.points - one.points);

  return (
    <table className="w-full">
      <caption className="flex items-baseline justify-between pb-1 text-xs text-white/45">
        <span>Board {at + 1}</span>
        <span className="font-semibold tabular-nums text-white/80">
          {placed === null ? "" : `${Math.round(placed)}%`}
        </span>
      </caption>
      <tbody>
        {lines.map((line, index) => (
          <Row key={index} {...line} />
        ))}
        {/* Null and empty are different answers and are drawn differently: one is a
            field that has not come back, the other a board nobody else has played. */}
        {result.field[me] === null ? (
          <tr>
            <td className="py-1 text-xs text-white/35" colSpan={3}>
              waiting for the other results
            </td>
          </tr>
        ) : result.field[me]!.length === 0 ? (
          <tr>
            <td className="py-1 text-xs text-white/35" colSpan={3}>
              nobody else has played this board yet
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** What one line says about its contract, beyond naming it. */
interface Described {
  readonly contract: Contract | null;
  /** How it went, in bridge's notation. */
  readonly mark: string;
  readonly points: number;
  /** Everything the contract alone cannot explain — see `contractTags`. */
  readonly tags: readonly string[];
}

/**
 * One result read into the words a row draws, whoever made it.
 *
 * Shared by this seat's own line and every recorded one so the two cannot describe
 * the same contract differently — and shared by the collapsed board row and the
 * traveller line under it, which are the same result twice.
 *
 * `seat`, `contract.declarer`, `tricks` and `vulnerable` must all be indexed the
 * same way. They are not the same way for the two callers, which is the whole reason
 * this takes them rather than reaching for them.
 */
function describe(options: {
  readonly contract: Contract | null;
  readonly net: number;
  readonly seat: PlayerId;
  readonly tricks: Pair<number> | null;
  readonly vulnerable: Pair<boolean>;
}): Described {
  const { contract, net, seat, tricks, vulnerable } = options;
  if (contract === null) {
    return { contract: null, mark: "", points: net, tags: [] };
  }
  return {
    contract,
    mark: resultOf(contract, tricks),
    points: net,
    tags: contractTags({
      defending: contract.declarer !== seat,
      // Honors need the tricks to score the contract without them — an entry from an
      // older server carries a score and no tricks, and that is a row this cannot
      // explain rather than one with no honors on it.
      honors: tricks === null ? null : honorsOn({ contract, net, seat, tricks, vulnerable }),
      vulnerable: vulnerable[contract.declarer],
    }),
  };
}

/** This seat's own result on a board, described. */
function mineOn(result: FieldResult, me: PlayerId): Described {
  return describe({
    contract: result.contract,
    net: netFor(result.points, me),
    seat: me,
    tricks: result.tricks,
    vulnerable: result.board.vulnerable,
  });
}

/** One line of a traveller, whoever made it. */
interface Line extends Described {
  readonly mine: boolean;
  readonly note: string | null;
  readonly who: string;
}

function Tags({ tags }: { readonly tags: readonly string[] }): React.JSX.Element {
  return (
    <>
      {tags.map((tag) => (
        <span key={tag} className="text-[0.65rem] text-white/35">
          {tag}
        </span>
      ))}
    </>
  );
}

function Row({ contract, mark, mine, note, points, tags, who }: Line): React.JSX.Element {
  return (
    <tr className={`border-t border-white/10 ${mine ? "text-white" : "text-white/70"}`}>
      <td className={`w-20 truncate py-1.5 pr-2 text-xs ${mine ? "font-semibold" : ""}`}>
        {who}
      </td>
      <td className="py-1.5 pr-2">
        <span className="flex flex-wrap items-baseline gap-1.5">
          {contract === null ? (
            <span className="text-xs text-white/45">passed out</span>
          ) : (
            <>
              <ContractText contract={contract} on="dark" />
              <span className="text-xs text-white/45">{mark}</span>
              <Tags tags={tags} />
            </>
          )}
          {note === null ? null : <span className="text-[0.65rem] text-white/35">{note}</span>}
        </span>
      </td>
      <td className="py-1.5 text-right tabular-nums">{signed(points)}</td>
    </tr>
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
