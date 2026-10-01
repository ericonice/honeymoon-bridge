import { boardPercentageOf } from "@hb/engine";
import type { FieldResult, PlayerId } from "@hb/engine";
import { ContractText } from "./CardText.js";
import { Chip } from "./Chip.js";
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
      // Relative to the line, not to the reader — see `Described.declarer`. The
      // same two words on every row, including this seat's own, which is what
      // stops a party being named twice under two names.
      names: { mine: "us", theirs: "them" },
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
 * **One of them is coloured and the rest are not** — see `Chip` for the red and
 * `contractTags` for why only `vul` gets it. Colouring the second would cost the
 * first its meaning.
 */
export function Tags({
  reserve = false,
  tags,
}: {
  /**
   * Hold the space for a chip the line does not have, so the ones it does have
   * land where they do on every other line.
   *
   * **This is what actually aligns them, and nothing cheaper does.** Flushing the
   * group right only lines up rows carrying the *same* chips: a row with honors
   * alone and a row with both put their honors chip in different places, which is
   * what a screenshot of eight boards showed. A reserved slot is the only thing
   * that holds an x whether or not the row uses it.
   *
   * `invisible` rather than removed, so the width comes from the chip itself and
   * nothing here has to know how wide one is. `aria-hidden`, because a chip that is
   * not there should not be read out as though it were.
   */
  readonly reserve?: boolean;
  readonly tags: readonly ContractTag[];
}): React.JSX.Element {
  return (
    <>
      {tags.map((tag) =>
        tag.shown ? (
          <Chip key={tag.label} tone={tag.tone}>
            {tag.label}
          </Chip>
        ) : reserve ? (
          <span key={tag.label} aria-hidden className="invisible">
            <Chip tone={tag.tone}>{tag.label}</Chip>
          </span>
        ) : null,
      )}
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
        {/* **The chips are pushed to the end rather than trailing the contract.**
            Contracts vary in width — `4♥` against `5♣ X` — so chips that follow them
            start at a different place on every row and read as debris on the end of
            each one. Against the right edge they line up down the column, and they
            land beside the figure they are there to explain rather than beside the
            contract, which needs no explaining. It costs nothing: a reserved slot per
            chip would align them exactly and there is no room for one.

            Wrapping is on the *group*, so a row too tight for both drops the chips
            whole to a second line, still flush, rather than splitting them. */}
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            {contract === null ? (
              <span className="text-xs text-white/45">passed out</span>
            ) : (
              <>
                <Declarer name={declarer} />
                <ContractText contract={contract} on="dark" />
                <span className="text-xs text-white/45">{mark}</span>
              </>
            )}
          </span>
          {contract === null && note === null ? null : (
            <span className="ml-auto flex shrink-0 items-baseline gap-1.5">
              {contract === null ? null : <Tags reserve tags={tags} />}
              {/* Provenance rather than a property of the contract, but it is the same
                  kind of mark and belongs in the same group — faint prose beside three
                  chips reads as something half-finished. */}
              {note === null ? null : (
                <Tags tags={[{ label: note, shown: true, tone: "plain" }]} />
              )}
            </span>
          )}
        </span>
      </td>
      <td
        className={`w-14 py-1.5 text-right tabular-nums ${mine ? "font-semibold" : ""}`}
      >
        {signed(points)}
      </td>
    </tr>
  );
}

/**
 * Who bought the contract, drawn as a field rather than a tag — see `Described`.
 *
 * Fixed width, so it aligns down a column of rows and the contracts all start in
 * the same place — which is what makes a column of two repeating words scannable
 * rather than repetitive.
 *
 * **Weight rather than a hue, and that is a decision rather than a leftover.**
 * Colour was asked for here too and there is nothing to borrow — bridge has a red
 * for vulnerability and no convention at all for marking declarer — so any hue
 * would be invented, which is what turns a palette into decoration. Brightness says
 * the one thing that matters without a key: **`us` is brighter**, so a glance down
 * the column finds the lines that bought their own contract.
 *
 * It is on **every** row, so it must not be the loudest thing there. A mark that
 * never varies in whether it appears cannot also compete with the ones that do.
 */
export function Declarer({ name }: { readonly name: string | null }): React.JSX.Element | null {
  if (name === null) {
    return null;
  }
  return (
    <span
      className={`w-9 shrink-0 text-[0.65rem] ${name === "us" ? "text-white/55" : "text-white/30"}`}
    >
      {name}
    </span>
  );
}
