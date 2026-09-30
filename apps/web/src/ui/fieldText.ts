import type { Contract, Pair, PlayerId } from "@hb/engine";

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
 * **Vulnerability qualifies the contract, not the reader.** `4♥ = vul` means that
 * contract was played vulnerable, which is the whole difference between 620 and 420
 * — and it is read that way rather than as "you were vulnerable" because a board
 * prescribes both sides' vulnerability at once and a traveller's rows need not all
 * have declared. The row below it says `defending` where that applies, so the pair
 * reads "4♠ played vulnerable, and I was defending it".
 *
 * That it is per row rather than said once for the board is what a caption could not
 * do: the collapsed list is five boards each at their own prescribed vulnerability,
 * with +110 and +720 in the same column and nothing above them to explain either.
 *
 * **Honors carry their figure**, because the bare word raises exactly the question
 * the tag exists to answer. Signed toward this line's own player, like the points
 * beside it — honors go to whoever *holds* them, defender included, so a line can
 * perfectly well be paid for them by the other side.
 *
 * Neither is drawn in red. Red means "this is a red suit" everywhere in this app,
 * and a red `vul` would sit two characters from a red pip.
 */
export function contractTags(options: {
  /** This line's own player was defending, rather than declaring. */
  readonly defending: boolean;
  /** Net honors toward this line's player, or null when there are none to name. */
  readonly honors: number | null;
  /** The *declaring* side was vulnerable, which is what the figures turn on. */
  readonly vulnerable: boolean;
}): readonly string[] {
  const tags: string[] = [];
  if (options.vulnerable) {
    tags.push("vul");
  }
  if (options.defending) {
    tags.push("defending");
  }
  if (options.honors !== null && options.honors !== 0) {
    tags.push(`honors ${signed(options.honors)}`);
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
