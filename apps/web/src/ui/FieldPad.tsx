import { boardPercentageOf, humanPercentageOf, netFor } from "@hb/engine";
import type { FieldResult, FieldSummary, PlayerId } from "@hb/engine";
import { useState } from "react";
import { ContractText } from "./CardText.js";

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
 */
export function FieldPad({
  latest = false,
  me,
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
  readonly summary: FieldSummary;
}): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null);

  // The reveal is about the board that just finished, so it draws that one traveller
  // outright — there is nothing to choose between and nothing to open.
  if (latest) {
    const result = summary.results[summary.results.length - 1];
    return (
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-xs text-white/45">
          Everybody here faced the same offers and kept their own cards.
        </p>
        {result === undefined ? null : (
          <Traveller at={summary.results.length - 1} me={me} result={result} />
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
          key={result.board.ids[me] ?? at}
          at={at}
          me={me}
          open={open === result.board.ids[me]}
          result={result}
          onToggle={() => {
            setOpen(open === result.board.ids[me] ? null : (result.board.ids[me] ?? null));
          }}
        />
      ))}
      <Foot summary={summary} />
    </div>
  );
}

/** One board, collapsed: what you did with it and where it placed. */
function BoardRow({
  at,
  me,
  onToggle,
  open,
  result,
}: {
  readonly at: number;
  readonly me: PlayerId;
  onToggle(): void;
  readonly open: boolean;
  readonly result: FieldResult;
}): React.JSX.Element {
  const placed = boardPercentageOf(result, me);
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
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          {result.contract === null ? (
            <span className="text-xs text-white/45">passed out</span>
          ) : (
            <>
              <ContractText contract={result.contract} on="dark" />
              <span className="text-xs text-white/45">
                {resultOf(result.contract, result.tricks)}
              </span>
              {result.contract.declarer === me ? null : (
                <span className="text-[0.65rem] text-white/35">defending</span>
              )}
            </>
          )}
        </span>
        <span className="shrink-0 tabular-nums text-white/60">
          {signed(netFor(result.points, me))}
        </span>
        <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
          {placed === null ? "—" : `${Math.round(placed)}%`}
        </span>
      </button>
      {open ? (
        <div className="border-b border-white/7 bg-white/5 px-2 pb-3">
          <Traveller at={at} me={me} result={result} />
        </div>
      ) : null}
    </>
  );
}

/** Everybody's result on one board, yours among them. */
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
  const mine: Line = {
    contract: result.contract,
    declaredByThem: result.contract !== null && result.contract.declarer !== me,
    mine: true,
    note: null,
    points: netFor(result.points, me),
    tricks: result.tricks,
    who: "you",
  };
  const others: readonly Line[] = (result.field[me] ?? []).map((entry) => ({
    contract: entry.contract,
    // A recorded entry's declarer is normalised to the seat holding this board's
    // stream, so 0 is always that row's own player.
    declaredByThem: entry.contract !== null && entry.contract.declarer !== 0,
    mine: false,
    note: entry.kind === "table" ? "played a person" : null,
    points: entry.points,
    tricks: entry.tricks,
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

/** One line of a traveller, whoever made it. */
interface Line {
  readonly contract: FieldResult["contract"];
  readonly declaredByThem: boolean;
  readonly mine: boolean;
  readonly note: string | null;
  readonly points: number;
  readonly tricks: readonly number[] | null;
  readonly who: string;
}

function Row({
  contract,
  declaredByThem,
  mine,
  note,
  points,
  tricks,
  who,
}: {
  readonly contract: FieldResult["contract"];
  /**
   * This row's player was defending, which is the one thing a score cannot say.
   *
   * Without it a board where the opposition always declares reads as every line
   * scoring nothing for no visible reason — a contract, a result, and a zero beside
   * them.
   *
   * **The word rather than "by them", which was a key the reader had to learn.**
   * "Them" is relative to whoever owns the row, so it named a different person on
   * every line — and on somebody else's row it reads far more naturally as *your*
   * opponent. `defending` is true on its own terms wherever it appears, which is the
   * same argument that had the pad name honors in words rather than mark them.
   *
   * It deliberately does not say who they were defending *against*: every entry on a
   * Doop board faced the same computer, so that belongs to the board and is said
   * once at the top rather than on every row.
   */
  readonly declaredByThem: boolean;
  readonly mine: boolean;
  readonly note: string | null;
  readonly points: number;
  readonly tricks: readonly number[] | null;
  readonly who: string;
}): React.JSX.Element {
  return (
    <tr className={`border-t border-white/10 ${mine ? "text-white" : "text-white/70"}`}>
      <td className={`w-20 truncate py-1.5 pr-2 text-xs ${mine ? "font-semibold" : ""}`}>
        {who}
      </td>
      <td className="py-1.5 pr-2">
        <span className="flex items-baseline gap-1.5">
          {contract === null ? (
            <span className="text-xs text-white/45">passed out</span>
          ) : (
            <>
              <ContractText contract={contract} on="dark" />
              <span className="text-xs text-white/45">{resultOf(contract, tricks)}</span>
              {declaredByThem ? (
                <span className="text-[0.65rem] text-white/35">defending</span>
              ) : null}
            </>
          )}
          {note === null ? null : <span className="text-[0.65rem] text-white/35">{note}</span>}
        </span>
      </td>
      <td className="py-1.5 text-right tabular-nums">{signed(points)}</td>
    </tr>
  );
}

/**
 * How the contract went, in bridge's notation.
 *
 * Blank when the tricks were not recorded rather than guessed at — an entry from an
 * older server may carry a score and a contract and nothing else, and "=" would be a
 * claim about a deal nobody has the record of.
 */
function resultOf(contract: NonNullable<FieldResult["contract"]>, tricks: readonly number[] | null): string {
  if (tricks === null) {
    return "";
  }
  const made = tricks[contract.declarer] ?? 0;
  const needed = contract.level + 6;
  return made >= needed ? (made === needed ? "=" : `+${made - needed}`) : `−${needed - made}`;
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

/** U+2212 for the minus, matching every other signed total in the app. */
function signed(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}
