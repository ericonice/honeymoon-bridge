import { totalScore } from "@hb/engine";
import type { PlayerId, RubberState } from "@hb/engine";

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
  readonly oneEach: Coefficients;
  readonly oneUp: Coefficients;
}

/**
 * Fitted over 3000 rubbers — 18,084 standings at no games each, 9,035 a game up —
 * and over 3000 single games for the short format's own cell, 18,204 standings.
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
  gameLead: 0.7092,
  level: { margin: 0.0794, part: 0.3492 },
  oneEach: { margin: 0.1142, part: 0.9173 },
  oneUp: { margin: 0.0911, part: 0.5753 },
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
  table: EquityTable = EQUITY,
): number {
  const aboveLine: [number, number] = [rubber.aboveLine[0], rubber.aboveLine[1]];
  aboveLine[seat] = aboveLine[seat]! + points;
  return equityOf({ ...rubber, aboveLine }, seat, table) - equityOf(rubber, seat, table);
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
