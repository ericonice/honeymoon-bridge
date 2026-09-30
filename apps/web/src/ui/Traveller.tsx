import { boardPercentageOf } from "@hb/engine";
import type { FieldResult, PlayerId } from "@hb/engine";
import { ContractText } from "./CardText.js";
import { describe, mineOn, signed, vulnerableFrom } from "./fieldText.js";
import type { Described } from "./fieldText.js";

/**
 * A board's traveller: every result on it, **best first, with yours in its place**.
 *
 * Ordered by score rather than by who played, because the traveller exists to show
 * where you came — and a list that pins your own line to the top answers a different
 * question, "what did I do", which the row that opened it has already answered.
 * Reading down the order and finding yourself is the point.
 *
 * Sorted descending on the net, which is the same quantity the matchpoints rank, so
 * the order on screen and the percentage beside it cannot disagree. Ties keep the
 * order they arrived in — a stable sort — so two identical scores sit together
 * instead of swapping about between renders.
 *
 * **The opposition is said once per board rather than tagged per row.** Every entry
 * on a board faced the same thing in solo play, so a per-row tag would imply it
 * varies and invite the reader to work out which rows are the comparable ones. What
 * does vary is who held the cards, and that is what each row names — along with
 * vulnerability and honors, which qualify the *contract* rather than the board and
 * really can differ from row to row. See `contractTags`.
 */
export function Traveller({
  at,
  caption = true,
  me,
  result,
}: {
  readonly at: number;
  /** Off where the surface around it already names the board — see `BoardReview`. */
  readonly caption?: boolean;
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
      {caption ? (
        <caption className="flex items-baseline justify-between pb-1 text-xs text-white/45">
          <span>Board {at + 1}</span>
          <span className="font-semibold tabular-nums text-white/80">
            {placed === null ? "" : `${Math.round(placed)}%`}
          </span>
        </caption>
      ) : null}
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
interface Line extends Described {
  readonly mine: boolean;
  readonly note: string | null;
  readonly who: string;
}

/** Whatever the contract cannot explain about a figure — see `contractTags`. */
export function Tags({ tags }: { readonly tags: readonly string[] }): React.JSX.Element {
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
