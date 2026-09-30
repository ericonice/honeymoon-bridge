import { honorsOn, netFor } from "@hb/engine";
import type { Contract, FieldResult, Pair, PlayerId } from "@hb/engine";

/**
 * The words a Doop traveller puts beside a contract, in one place.
 *
 * Three surfaces draw a contract from this format — the collapsed board row, every
 * line of a traveller, and the header of a board's review — and all three have to
 * say the same things about it in the same words. A list built here is one thing to
 * be wrong about rather than three; the same argument `boardKeyOf` settled after a
 * comment asserting that two copies agreed turned out to be wrong for a release.
 */

/**
 * Why a figure is the size it is, when the contract alone cannot say.
 *
 * **Only what might not apply.** A tag is a note about an exception — this board was
 * vulnerable, this line was paid honors, this score was made across the table from a
 * person. Whether a line declared or defended is *always* one or the other, so it is
 * not a note at all; it reads as a field and is drawn as one, immediately before the
 * contract it governs. See `Described.role`.
 *
 * **Vulnerability qualifies the contract, not the reader.** `4♥ = vul` means that
 * contract was played vulnerable, which is the whole difference between 620 and 420
 * — and it is read that way rather than as "you were vulnerable" because a board
 * prescribes both sides' vulnerability at once and a traveller's rows need not all
 * have declared.
 *
 * That it is per row rather than said once for the board is what a caption could not
 * do: the collapsed list is boards each at their own prescribed vulnerability, with
 * +110 and +720 in the same column and nothing above them to explain either.
 *
 * **Honors are flagged rather than accounted for.** `h100` says this figure has
 * honors in it — which is the question, because honors are the one component a
 * contract cannot explain. It carried a sign for a while and the sign was the wrong
 * amount of precision for a tag: it turned a mark into a ledger entry, and a reader
 * wanting the arithmetic has the contract, the result and the terms beside it. What
 * is given up is real and worth stating — a line paid 100 and a line whose opponent
 * was paid 100 now look the same, and those differ by two hundred.
 *
 * `h` is the one abbreviation here a reader has to learn, and the two-column
 * `Scorepad` deliberately spells the word out for exactly that reason. The two are
 * not in conflict: that pad has a column to put a figure in and prose to label it,
 * where this is a row of chips in which `vul` is already short.
 *
 * **Only `vul` carries a colour, and it is borrowed rather than invented.** Every
 * bridge scorecard ever printed draws vulnerability in red, so this is the player's
 * own language rather than a fourth vocabulary — and vulnerability is the largest
 * multiplier on any figure here, which is what earns the loudest mark on the row.
 *
 * **The tint is on the chip, not on the letters**, which is what keeps it clear of
 * the one rule red already has: `text-red-400` means *this is a red suit*, and a red
 * word sitting two characters from a red pip is exactly the collision that argument
 * was about. A red-grounded badge is not a glyph and cannot be misread as one.
 *
 * **And only one of them is coloured, which is the point of colouring any.** `h100`
 * stays neutral: with both tinted they compete, and the red stops meaning "look at
 * this" and starts meaning "this is a tag". One hue doing one job.
 */
export interface ContractTag {
  readonly label: string;
  /** `vulnerable` takes the red every scorecard draws it in; everything else is plain. */
  readonly tone: "plain" | "vulnerable";
}

export function contractTags(options: {
  /** Net honors toward this line's player, or null when there are none to name. */
  readonly honors: number | null;
  /** The *declaring* side was vulnerable, which is what the figures turn on. */
  readonly vulnerable: boolean;
}): readonly ContractTag[] {
  const tags: ContractTag[] = [];
  if (options.vulnerable) {
    tags.push({ label: "vul", tone: "vulnerable" });
  }
  if (options.honors !== null && options.honors !== 0) {
    tags.push({ label: `h${Math.abs(options.honors)}`, tone: "plain" });
  }
  return tags;
}

/**
 * How the contract went, in bridge's notation.
 *
 * Blank when the tricks were not recorded rather than guessed at — an entry from an
 * older server may carry a score and a contract and nothing else, and "=" would be a
 * claim about a deal nobody has the record of.
 */
export function resultOf(contract: Contract, tricks: readonly number[] | null): string {
  if (tricks === null) {
    return "";
  }
  const made = tricks[contract.declarer] ?? 0;
  const needed = contract.level + 6;
  return made >= needed ? (made === needed ? "=" : `+${made - needed}`) : `−${needed - made}`;
}

/**
 * A board's terms as the seat holding *this* stream sees them, with that seat as 0.
 *
 * `FieldBoard.vulnerable` is indexed by the real seats, where a recorded entry has
 * already been turned round so its declarer is the stream's own holder. Reading one
 * against the other is how a table's second seat would have every figure on its
 * traveller explained by the wrong side's vulnerability.
 */
export function vulnerableFrom(vulnerable: Pair<boolean>, me: PlayerId): Pair<boolean> {
  return me === 0 ? vulnerable : [vulnerable[1], vulnerable[0]];
}

/** U+2212 for the minus, matching every other signed total in the app. */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}

/** What one line says about its contract, beyond naming it. */
export interface Described {
  readonly contract: Contract | null;
  /** How it went, in bridge's notation. */
  readonly mark: string;
  readonly points: number;
  /**
   * **Who bought the contract**, named, or null where there is none to name.
   *
   * A field rather than a tag, because it is always somebody — a chip that never
   * varies in *whether* it is there is not marking an exception, and one that is
   * always present reads as noise around the ones that mean something. Drawn
   * immediately before the contract, fixed width so it aligns down the column,
   * where it reads as what it is: `you 4♥`, `Computer 4♥`.
   *
   * **Who rather than `bid`/`def`, which said the same thing the long way round.**
   * Those told you what *this line's player* did and left you to work out who that
   * implied had bid it; on a board where everybody defends, a column of `def`
   * answers a question nobody asked, twice over. This is duplicate's own By column.
   *
   * **It only has to separate you from not-you**, which is what keeps it narrow: the
   * row's own player where they bought it, and `opp` where the other side did. On a
   * Doop board that is not the shifting "them" this file rejected once before —
   * every entry faced the same computer, so `opp` names the same party on every row
   * rather than a different one per line. A result made across the table is the
   * exception and says so.
   *
   * On a traveller it repeats the name beside it whenever that player declared,
   * which is what a real By column does next to a pair column — the repetition *is*
   * the reading, because what varies down the column is whether the two match.
   */
  readonly declarer: string | null;
  /** Everything the contract alone cannot explain — see `contractTags`. */
  readonly tags: readonly ContractTag[];
}

/**
 * One result read into the words a row draws, whoever made it.
 *
 * Shared by this seat's own line and every recorded one so the two cannot describe
 * the same contract differently — and shared by the board row and the traveller line
 * behind it, which are the same result twice.
 *
 * `seat`, `contract.declarer`, `tricks` and `vulnerable` must all be indexed the same
 * way. They are not the same way for the two callers, which is the whole reason this
 * takes them rather than reaching for them.
 */
export function describe(options: {
  readonly contract: Contract | null;
  /** What to call this line's own player, and what to call whoever sat opposite. */
  readonly names: { readonly mine: string; readonly theirs: string };
  readonly net: number;
  readonly seat: PlayerId;
  readonly tricks: Pair<number> | null;
  readonly vulnerable: Pair<boolean>;
}): Described {
  const { contract, names, net, seat, tricks, vulnerable } = options;
  if (contract === null) {
    return { contract: null, declarer: null, mark: "", points: net, tags: [] };
  }
  return {
    contract,
    declarer: contract.declarer === seat ? names.mine : names.theirs,
    mark: resultOf(contract, tricks),
    points: net,
    tags: contractTags({
      // Honors need the tricks to score the contract without them — an entry from an
      // older server carries a score and no tricks, and that is a row this cannot
      // explain rather than one with no honors on it.
      honors: tricks === null ? null : honorsOn({ contract, net, seat, tricks, vulnerable }),
      vulnerable: vulnerable[contract.declarer],
    }),
  };
}

/** This seat's own result on a board, described. */
export function mineOn(result: FieldResult, me: PlayerId): Described {
  return describe({
    contract: result.contract,
    names: { mine: "you", theirs: "opp" },
    net: netFor(result.points, me),
    seat: me,
    tricks: result.tricks,
    vulnerable: result.board.vulnerable,
  });
}
