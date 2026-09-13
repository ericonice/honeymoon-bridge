import { boardPercentageOf, humanPercentageOf } from "@hb/engine";
import type { FieldEntry, FieldResult, FieldSummary, PlayerId } from "@hb/engine";
import { ContractText } from "./CardText.js";

/**
 * The scorepad of a field session: a board at a time, you among everybody else.
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
  me,
  summary,
}: {
  readonly me: PlayerId;
  readonly summary: FieldSummary;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-white/45">
        Each board once, ranked against everybody who has held these cards. The other
        results faced the same offers and kept their own cards, so none of them is your
        hand bid twice.
      </p>
      {summary.results.map((result, at) => (
        <Board key={result.board.id} at={at} me={me} result={result} />
      ))}
      <Foot summary={summary} />
    </div>
  );
}

function Board({
  at,
  me,
  result,
}: {
  readonly at: number;
  readonly me: PlayerId;
  readonly result: FieldResult;
}): React.JSX.Element {
  const placed = boardPercentageOf(result, me);
  return (
    <table className="w-full">
      <caption className="flex items-baseline justify-between pb-1 text-xs text-white/45">
        <span>Board {at + 1}</span>
        <span className="font-semibold tabular-nums text-white/80">
          {placed === null ? "" : `${Math.round(placed)}%`}
        </span>
      </caption>
      <tbody>
        <Row
          mine
          contract={result.contract}
          points={result.points[me]}
          who="you"
          tricks={result.tricks}
        />
        {/* Null and empty are different answers and are drawn differently: one is a
            field that has not come back, the other a board nobody else has played. */}
        {result.field === null ? (
          <tr>
            <td className="py-1 text-xs text-white/35" colSpan={3}>
              waiting for the other results
            </td>
          </tr>
        ) : result.field.length === 0 ? (
          <tr>
            <td className="py-1 text-xs text-white/35" colSpan={3}>
              nobody else has played this board yet
            </td>
          </tr>
        ) : (
          result.field.map((entry, index) => <Entry key={index} entry={entry} />)
        )}
      </tbody>
    </table>
  );
}

function Entry({ entry }: { readonly entry: FieldEntry }): React.JSX.Element {
  return (
    <Row
      contract={entry.contract}
      note={entry.kind === "table" ? "played a person" : null}
      points={entry.points}
      tricks={entry.tricks}
      who={entry.who}
    />
  );
}

function Row({
  contract,
  mine = false,
  note = null,
  points,
  tricks,
  who,
}: {
  readonly contract: FieldResult["contract"];
  readonly mine?: boolean;
  readonly note?: string | null;
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
        <span className="text-white/55">
          Overall · {summary.boardsRanked} of {summary.boardsPlayed} ranked
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
