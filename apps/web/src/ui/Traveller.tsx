import { boardPercentageOf } from "@hb/engine";
import type { FieldResult, PlayerId } from "@hb/engine";
import { ContractText } from "./CardText.js";
import { describe, mineOn, signed, vulnerableFrom } from "./fieldText.js";
import type { ContractTag, Described } from "./fieldText.js";

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
      // Every entry on a Doop board faced the same opposition this seat did — the
      // one exception being a result made across the table, where the person
      // opposite is not somebody this board can name.
      // `opp` rather than a name: on a Doop board every entry faced the same
      // opposition, so it is the same party on every row. A table result is the one
      // exception, and the person opposite is not somebody this board can name.
      names: { mine: entry.who, theirs: entry.kind === "table" ? "a person" : "opp" },
      net: entry.points,
      seat: 0,
      tricks: entry.tricks,
      vulnerable: theirTerms,
    }),
    mine: false,
    note: entry.kind === "table" ? "vs person" : null,
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

/**
 * Whatever the contract cannot explain about a figure — see `contractTags`.
 *
 * **Drawn as chips, because faint grey words beside a contract are not tags**, they
 * are a sentence that ran out of room: `4♥ = vul bid h+100` read as five things of
 * equal weight rather than a contract with three notes attached. A ground and a
 * border are what say "this is a label on that", and small caps say it again —
 * `VUL` is not a word in the sentence, it is a mark.
 *
 * **One of them is coloured and the rest are not** — see `contractTags` for which
 * and why. The short version: red on `vul` is borrowed from every bridge scorecard
 * ever printed rather than invented, the tint is on the chip rather than the
 * letters so it cannot be taken for a red suit, and colouring the second one would
 * cost the first its meaning.
 */
const TONE: Record<ContractTag["tone"], string> = {
  plain: "border-white/10 bg-white/8 text-white/60",
  vulnerable: "border-red-400/30 bg-red-400/12 text-red-200/90",
};

export function Tags({ tags }: { readonly tags: readonly ContractTag[] }): React.JSX.Element {
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag.label}
          className={`rounded border px-1 py-px text-[0.6rem] leading-[1.35] font-medium tracking-wide uppercase ${TONE[tag.tone]}`}
        >
          {tag.label}
        </span>
      ))}
    </>
  );
}

/**
 * Your own line, marked so it can be found rather than read for.
 *
 * A traveller is sorted by score, so your row lands anywhere in it — and "where am
 * I" is the question the whole thing exists to answer. Full-weight white against the
 * others' 70% was the only difference and it is not one you can *scan* for: it made
 * the row legible once found, which is a different job.
 *
 * A band behind the row is what makes it findable at a glance. `bg-white/8` rather
 * than a colour: amber means "it is your move" everywhere on the board, and the
 * metals belong to achievements — this is the same quiet wash the app already uses
 * for the row that matters in a list.
 *
 * **`aria-current` is the mark, and the styling hangs off it.** It is what the
 * attribute means — the current item of a set — and it is the only thing here a
 * screen reader can use, which otherwise has nothing but the word "you" in a column
 * of names. It also gives the test something to assert that is not a class: see
 * `suitInk.test.ts` for why naming a class beats naming an opacity, and this is one
 * better again.
 */
function Row({ contract, declarer, mark, mine, note, points, tags, who }: Line): React.JSX.Element {
  return (
    <tr
      aria-current={mine ? "true" : undefined}
      className={`border-t border-white/10 ${mine ? "bg-white/8 text-white" : "text-white/70"}`}
    >
      {/* The weight goes on the two things a reader scans for — who, and how much —
          rather than on the row, which would drag the faint tags up with it. */}
      <td className={`w-20 truncate py-1.5 pr-2 text-xs ${mine ? "font-semibold" : ""}`}>
        {who}
      </td>
      <td className="py-1.5 pr-2">
        <span className="flex flex-wrap items-baseline gap-1.5">
          {contract === null ? (
            <span className="text-xs text-white/45">passed out</span>
          ) : (
            <>
              <Declarer name={declarer} wide />
              <ContractText contract={contract} on="dark" />
              <span className="text-xs text-white/45">{mark}</span>
              <Tags tags={tags} />
            </>
          )}
          {/* Provenance rather than a property of the contract, but it sits in the
              same slot and is the same kind of mark, so it takes the same chip —
              faint prose beside three chips reads as something half-finished. */}
          {note === null ? null : <Tags tags={[{ label: note, tone: "plain" }]} />}
        </span>
      </td>
      <td className={`py-1.5 text-right tabular-nums ${mine ? "font-semibold" : ""}`}>
        {signed(points)}
      </td>
    </tr>
  );
}

/**
 * Who bought the contract, drawn as a field rather than a tag — see `Described`.
 *
 * Fixed width and truncating, so it aligns down a column of rows: what varies there
 * is whether the name matches the one beside it, and that only reads as a column if
 * the contracts start in the same place.
 *
 * **Weight rather than a hue, and that is a decision rather than a leftover.**
 * Colour was asked for here too and there is nothing to borrow — bridge has a red
 * for vulnerability and no convention at all for marking declarer — so any hue
 * would be invented, which is what turns a palette into decoration. Brightness says
 * the one thing that matters without a key: **your own name is brighter**, so a
 * glance down the column finds the contracts that were yours.
 *
 * It is on **every** row, so it must not be the loudest thing there. A mark that
 * never varies in whether it appears cannot also compete with the ones that do.
 */
export function Declarer({
  name,
  wide = false,
}: {
  readonly name: string | null;
  /**
   * Room for a player's name as well as `you` and `opp`.
   *
   * A traveller's rows belong to different people, so the field has to hold
   * whatever any of them is called; a board list is all your own results, where the
   * only two values it can ever take are three characters each. Reserving the
   * traveller's width there would push the tags onto a second line for nothing.
   */
  readonly wide?: boolean;
}): React.JSX.Element | null {
  if (name === null) {
    return null;
  }
  return (
    <span
      className={`${wide ? "w-14" : "w-8"} shrink-0 truncate text-[0.65rem] ${
        name === "you" ? "text-white/55" : "text-white/30"
      }`}
    >
      {name}
    </span>
  );
}
