import { fieldMarginOf } from "@hb/engine";
import type { FieldResult, FieldSummary, PlayerId } from "@hb/engine";
import { ContractText } from "./CardText.js";

/**
 * The scorepad of a field session: a row a board, you against what was recorded.
 *
 * One row rather than `SessionPad`'s paired columns, because a board here *is* one
 * deal — it is met once, and the figure it is compared against was played by somebody
 * else on another evening. So the two cells to read across are yours and theirs, and
 * the margin is the third rather than an addition the reader is asked to do: the sum
 * trick that lets a session pad omit a per-row total works only because both of its
 * figures are the same player's.
 *
 * **A blank reference is a board played and not yet compared, not a board worth
 * nothing.** §1.8a fetches a board's history only after the deal, deliberately, and it
 * may never arrive. Drawing that as a zero would be the same lie the session pad's own
 * dash once told, so the margin column stays empty and the score column does not.
 */
export function FieldPad({
  me,
  summary,
}: {
  readonly me: PlayerId;
  readonly summary: FieldSummary;
}): React.JSX.Element {
  return (
    <table className="w-full text-sm">
      <caption className="pb-2 text-left text-xs text-white/45">
        Each board once, against what the same cards have been worth before. The recorded
        hand faced the same offers and kept its own cards, so it is not your hand bid
        twice.
      </caption>
      <thead>
        <tr className="text-xs text-white/40">
          <th className="py-1 pr-2 text-left font-normal">Board</th>
          <th className="py-1 pr-2 text-left font-normal">You</th>
          <th className="py-1 pr-2 text-left font-normal">Recorded</th>
          <th className="py-1 text-right font-normal">
            {summary.scoring === "imps" ? "IMPs" : "Margin"}
          </th>
        </tr>
      </thead>
      <tbody>
        {summary.results.map((result, at) => (
          <Row key={result.board.id} at={at} me={me} result={result} summary={summary} />
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-white/15 text-sm">
          <td className="py-2 pr-2 text-xs text-white/45" colSpan={3}>
            {summary.boardsCompared} of {summary.boardsPlayed} compared
          </td>
          <td className="py-2 text-right font-semibold tabular-nums">
            {signed(summary.margin)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function Row({
  at,
  me,
  result,
  summary,
}: {
  readonly at: number;
  readonly me: PlayerId;
  readonly result: FieldResult;
  readonly summary: FieldSummary;
}): React.JSX.Element {
  const margin = fieldMarginOf(result, me, summary.scoring);
  return (
    <tr className="border-t border-white/10 align-top">
      <td className="py-2 pr-2 text-xs tabular-nums text-white/45">{at + 1}</td>
      <td className="py-2 pr-2">
        <Played contract={result.contract} points={result.points[me]} />
      </td>
      <td className="py-2 pr-2">
        {result.reference === null ? (
          <span className="text-xs text-white/35">not back yet</span>
        ) : (
          <Played contract={result.reference.contract} points={result.reference.points} />
        )}
      </td>
      <td className="py-2 text-right font-semibold tabular-nums">
        {margin === null ? "" : signed(margin)}
      </td>
    </tr>
  );
}

function Played({
  contract,
  points,
}: {
  readonly contract: FieldResult["contract"];
  readonly points: number;
}): React.JSX.Element {
  return (
    <span className="flex items-baseline gap-1.5">
      {contract === null ? (
        <span className="text-xs text-white/45">passed out</span>
      ) : (
        <ContractText contract={contract} on="dark" />
      )}
      <span className="text-xs tabular-nums text-white/60">{signed(points)}</span>
    </span>
  );
}

/** U+2212 for the minus, matching every other signed total in the app. */
function signed(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}
