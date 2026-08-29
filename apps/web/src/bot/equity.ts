import { totalScore } from "@hb/engine";
import type { PairStanding, PlayerId, RubberState } from "@hb/engine";

/**
 * The chance of taking the match from a standing.
 *
 * `bidValue.ts` prices a call by how far it moves the score, and points are not
 * what the game is settled by — two games are. A part-score banked at one game
 * each is worth more than twice what the same part-score is worth at love all,
 * the game that finishes a rubber is worth several times the game that starts
 * one, and a flat constant added to a points total says none of that. This is
 * that constant replaced by a measurement.
 *
 * Fitted by `bench/equity.ts`: play rubbers, record the standing at the start of
 * every deal, label each with who eventually won, and regress. See that file for
 * the numbers and for the two things worth knowing about them — the fit is
 * circular, since the rubbers are played by the bidder this would become, and the
 * standard errors are optimistic because every standing inside one rubber shares
 * that rubber's outcome.
 */

/** What the two features are worth in log-odds, within one games state. */
interface Coefficients {
  /** Per 100 points of total score, this seat's way. */
  readonly margin: number;
  /** Per whole game of below-the-line progress, this seat's way. */
  readonly part: number;
}

/** The second half also prices how much of the aggregate was carried into it. */
interface SecondHalf extends Coefficients {
  /**
   * What a carried 100 is worth *beyond* the same 100 counted in `margin`, in
   * log-odds. Negative, because a carried point is worth less than one banked here.
   *
   * The aggregate is the feature, so the pair reads as `margin × aggregate + carried
   * × carriedPart` — which makes a fresh point worth `margin` and a carried one worth
   * `margin + carried`. Fitted at −0.09 against a margin of +0.21, so about 57%.
   */
  readonly carried: number;
}

/** A two-game match, whose verdict is the pair's aggregate rather than either half's. */
interface MirrorCells {
  readonly first: Coefficients;
  readonly second: SecondHalf;
}

export interface EquityTable {
  /**
   * A one-game match, which has exactly one standing to be in.
   *
   * Winning a game *is* winning the match, so nobody is ever a game up and nobody
   * is ever vulnerable. Fitted separately because it is a different game rather
   * than a shorter rubber, and the numbers say so: a part-score is worth +0.95
   * here against +0.35 at the same nothing-to-nothing standing in a rubber, since
   * here it is progress toward the whole match.
   */
  readonly game: Coefficients;
  /** Log-odds of holding one game to none. Negated for being the side that is behind. */
  readonly gameLead: number;
  readonly level: Coefficients;
  /**
   * A pair of games on one set of boards.
   *
   * Split by which half rather than by anything about the score, because the two are
   * different situations: the first has a whole second game of variance still to come
   * and the second is playing against a number it already knows. That shows up hardest
   * in the part-score, worth **nothing measurable in the first half and +0.46 in the
   * second** — a single cell, which is what a mirror used to be priced from, cannot say
   * that and was saying +0.95 in both.
   */
  readonly mirror: MirrorCells;
  readonly oneEach: Coefficients;
  readonly oneUp: Coefficients;
}

/**
 * Fitted over 300 rubbers played with the solver — 4,848 standings — and over 3000
 * single games for the short format's own cell.
 *
 * **The rubber numbers were re-fitted under solver card play, and that mattered.**
 * The first version was fitted from 3000 rubbers with the fast heuristic card play,
 * where contracts fail more often than they do in a real game — so the bidder
 * learned to stretch in a world where stretching was safer than it is, and
 * overreached once it met proper play. Re-fitting under the solver dropped
 * `gameLead` from 0.71 to 0.61 and, measured against v2 at eight samples a card,
 * cut contracts going down two or more from **18% of its own deals to 13%**, and
 * what they cost from 508 a rubber to 325, with the rubbers won unchanged at 65%.
 * Fewer disasters for the same result.
 *
 * The price is sample size: 4,848 standings against 36,168, since switching the
 * solver on costs about 250× per rubber. Error bars are roughly 2.7× wider and the
 * short format's cell is still the cheap fit.
 *
 * **`level.part` is negative and is not understood.** It says a part-score at love
 * all is worth nothing, which is hard to believe. That cell has now taken four
 * values across four fits — +0.44, +0.35, +0.00, -0.22 — and the reason is
 * structural rather than mysterious: `part` and `margin` overlap, because
 * part-score points sit inside the total, so the split between those two
 * coefficients is unstable even where their sum is not. It ships because the table
 * measurably behaves better, not because this number is trusted.
 *
 * Three checks came out of the fit rather than being assumed: a level standing
 * won 0.500, one game each won 0.500, and a game down fitted the exact negative
 * of a game up with identical coefficients. That is what licences imposing the
 * antisymmetry below instead of storing four independent states.
 *
 * Read `gameLead` against the hand-derived `DEFAULT_GAME_EQUITY` it replaces:
 * holding a game is worth 0.71 log-odds, which is a 0.670 chance of the rubber
 * against 0.500. The 400 points the old constant credited for the same thing is
 * worth about 0.08 in chance at the same standing — so the flat number was
 * roughly half of what a game is really worth, and it was the same number at
 * every standing.
 *
 * **Fitted from rubbers played by the points bidder, and that is deliberate
 * rather than a stage on the way to something.** Refitting from rubbers the
 * *equity* bidder played moves these a long way — `gameLead` 0.71 to 0.20, the
 * part-score term at level to nothing — and installing the refit makes the bidder
 * measurably worse, 66.6% of rubbers against 78.9%, with the points margin turning
 * negative. So this is not a self-consistency problem to iterate to convergence.
 * It is an **opponent model**: what a standing is worth depends on who is sitting
 * opposite, and a table fitted where both sides fight equally hard for games
 * describes a world this bidder is not in.
 *
 * Which leaves the honest open question. These numbers describe playing the points
 * bidder, and the opponent that matters is a person. The 293 recorded deals in the
 * hand log are the population to fit against, and nothing has done that yet.
 */
export const EQUITY: EquityTable = {
  game: { margin: 0.1738, part: 0.9548 },
  gameLead: 0.6104,
  level: { margin: 0.1328, part: -0.2204 },
  // 400 two-game matches, 5,978 deal-start standings, four samples a card —
  // `bench/equity.ts 400 4 format=mirror`. Both intercepts fitted at +0.00 ± 0.04,
  // which is the antisymmetry check passing rather than a number being used.
  //
  // **Fitted from the points bidder, and refitting from the bidder it became was tried
  // and is worse.** The refit moves a long way — both margins double and the
  // second-half part-score flips from +0.46 to −0.32, error bars nowhere near
  // overlapping — and installing it scores 50.6% ± 2.3 against the same reference this
  // table scores 60.2% ± 2.3 against. So it stays, and the honest description of it is
  // the one the rubber table already carries: an opponent model of the points bidder.
  //
  // The mechanism is a selection effect turned into a policy. Under this bidder a seat
  // merely holding a part-score in the second half is one that *settled* when it should
  // have stretched, so the refit reads "part-scores lose" as causal and produces a
  // bidder that avoids them — down two or more in 6% of its deals against this table's
  // 10%, timid rather than better, and −314 points a match. Level pairs also fall from
  // 17% of matches to 5%, so the two fits are not describing the same population at all.
  mirror: {
    first: { margin: 0.1409, part: -0.0561 },
    second: { carried: -0.0904, margin: 0.2113, part: 0.4649 },
  },
  oneEach: { margin: 0.1359, part: 0.6945 },
  oneUp: { margin: 0.1124, part: 0.5461 },
};

/** Below-the-line points that win a game, so a part-score reads as a fraction of one. */
const GAME_THRESHOLD = 100;

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

/**
 * What a number of points is worth here, as a chance of the rubber.
 *
 * Exists for one caller: the disguise credit is a fitted constant in points, and
 * under the equity objective it has to be added to a number between zero and one.
 * Converting it rather than inventing a second constant keeps the thing that was
 * measured — 200 points, checked against how often the disguise actually fires —
 * and lets it mean the same thing it always meant. It also makes the credit
 * correctly worth less at a standing where points matter less, which a second
 * hand-set constant would not.
 *
 * Added above the line, because that is where a credit that is not a real score
 * belongs: it moves the margin and leaves the part-score and the games alone.
 */
export function pointsAsEquity(
  rubber: RubberState,
  seat: PlayerId,
  points: number,
  /** Present when the currency is a mirror's own, which is a different scale again. */
  pair?: PairStanding,
  table: EquityTable = EQUITY,
): number {
  const aboveLine: [number, number] = [rubber.aboveLine[0], rubber.aboveLine[1]];
  aboveLine[seat] = aboveLine[seat]! + points;
  const after = { ...rubber, aboveLine };
  return pair === undefined
    ? equityOf(after, seat, table) - equityOf(rubber, seat, table)
    : mirrorEquityOf(after, pair, seat, table) - mirrorEquityOf(rubber, pair, seat, table);
}

/**
 * This seat's chance of taking the rubber from here.
 *
 * Antisymmetric by construction rather than by fitting: both features are
 * differences taken this seat's way, a symmetric state gets no intercept, and one
 * game up is the exact negative of one game down. So `equityOf(r, 0) +
 * equityOf(r, 1)` is one, which a bidder comparing two futures needs to be able
 * to rely on — a table that only nearly had that property would let a call look
 * good to both seats at once.
 */
/**
 * This seat's chance of taking a two-game match from here.
 *
 * Antisymmetric on the same terms as `equityOf`: every feature is a difference taken
 * this seat's way and no state carries an intercept, so the two seats' chances sum to
 * one exactly. A bidder comparing two futures relies on that.
 *
 * **The first half completing is not the match completing, and that is the one branch
 * a rubber has no equivalent of.** `equityOf` answers 1 or 0 the moment its rubber is
 * complete, because there the rubber *is* the match. Here a finished first half simply
 * becomes the standing the second half opens at — everything it banked turns into
 * carry, the part-score is spent, and the situation is the start of half two. Reading
 * it as a decided match is what would have the bidder treat winning the first game as
 * winning the pair, which is the whole error this cell exists to correct.
 */
export function mirrorEquityOf(
  rubber: RubberState,
  pair: PairStanding,
  seat: PlayerId,
  table: EquityTable = EQUITY,
): number {
  const them: PlayerId = seat === 0 ? 1 : 0;
  const total = totalScore(rubber);
  const carried = (pair.carried[seat]! - pair.carried[them]!) / GAME_THRESHOLD;
  const here = (total[seat]! - total[them]!) / GAME_THRESHOLD;
  const aggregate = carried + here;

  if (pair.half === 2 && rubber.complete) {
    // The pair is over and the aggregate has answered it.
    return aggregate === 0 ? 0.5 : aggregate > 0 ? 1 : 0;
  }

  const part = (rubber.partScore[seat]! - rubber.partScore[them]!) / GAME_THRESHOLD;

  if (pair.half === 2) {
    const cell = table.mirror.second;
    return sigmoid(cell.part * part + cell.margin * aggregate + cell.carried * carried);
  }

  if (rubber.complete) {
    // The first half is done: what it came to is the carry, and the next thing that
    // happens is the second half opening at that number with a clean part-score.
    const cell = table.mirror.second;
    return sigmoid(cell.margin * aggregate + cell.carried * aggregate);
  }

  const cell = table.mirror.first;
  return sigmoid(cell.part * part + cell.margin * aggregate);
}

export function equityOf(rubber: RubberState, seat: PlayerId, table: EquityTable = EQUITY): number {
  if (rubber.complete) {
    // The bonus is already on the pad and the question has been answered.
    return rubber.winner === null ? 0.5 : rubber.winner === seat ? 1 : 0;
  }

  const them: PlayerId = seat === 0 ? 1 : 0;
  const total = totalScore(rubber);
  const margin = (total[seat]! - total[them]!) / GAME_THRESHOLD;
  const part = (rubber.partScore[seat]! - rubber.partScore[them]!) / GAME_THRESHOLD;
  const mine = rubber.gamesWon[seat]!;
  const theirs = rubber.gamesWon[them]!;

  if (rubber.format === "game") {
    // One state, no games, nobody vulnerable — see `EquityTable.game`.
    return sigmoid(table.game.part * part + table.game.margin * margin);
  }

  const lead = mine === theirs ? 0 : mine > theirs ? table.gameLead : -table.gameLead;
  const coefficients = mine === theirs ? (mine === 0 ? table.level : table.oneEach) : table.oneUp;

  return sigmoid(lead + coefficients.part * part + coefficients.margin * margin);
}
