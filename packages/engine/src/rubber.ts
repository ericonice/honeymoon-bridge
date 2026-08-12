import type { DealScore } from "./scoring.js";
import type { Pair, PlayerId } from "./types.js";

const GAME_THRESHOLD = 100;

/**
 * Awarded for winning a one-game match.
 *
 * Rubber bridge has no bonus for a game — its 700/500 is specifically for taking
 * the rubber — so a single game played by the rubber rules would end with no
 * bonus at all and be decided by trick points alone. This is Chicago's
 * non-vulnerable game bonus, borrowed because a match needs something to be
 * worth winning. It is the one convention here imported from another form of
 * the game.
 */
const GAME_BONUS = 300;

/**
 * How long a sitting runs.
 *
 * `rubber` is the traditional best-of-three and the default. `game` ends the
 * moment somebody first reaches 100 below the line.
 *
 * The consequence worth knowing: **nobody is ever vulnerable in a `game`
 * match**. Vulnerability is having won a game, and in this format winning a game
 * ends the match — so every deal is played non-vulnerable. That is not a
 * shortcut in the implementation, it is what the format means, and it removes
 * doubled vulnerable penalties and the whole pressure of being vulnerable when
 * the opponent is not.
 */
export type MatchFormat = "game" | "rubber";

export interface RubberState {
  /** Bonuses, penalties, overtricks and honors. Never counts toward game. Includes `matchBonus`. */
  readonly aboveLine: Pair<number>;
  /** Every below-the-line point ever scored, including games already won. */
  readonly belowLineTotal: Pair<number>;
  readonly complete: boolean;
  /** What it takes to finish. Fixed when the match starts and never changes. */
  readonly format: MatchFormat;
  readonly gamesWon: Pair<number>;
  /**
   * 700 or 500 for taking the rubber, 300 for a one-game match, folded into
   * `aboveLine` the moment the match completes. Kept separately as well so a
   * UI can show it as its own line rather than a jump in a total nobody
   * asked "a jump of what?" about.
   */
  readonly matchBonus: Pair<number>;
  /** Below-the-line points toward the game currently in progress. Wiped when a game is won. */
  readonly partScore: Pair<number>;
  readonly winner: PlayerId | null;
}

export function newRubber(format: MatchFormat = "rubber"): RubberState {
  return {
    aboveLine: [0, 0],
    belowLineTotal: [0, 0],
    complete: false,
    format,
    gamesWon: [0, 0],
    matchBonus: [0, 0],
    partScore: [0, 0],
    winner: null,
  };
}

/**
 * A side is vulnerable once it has won a game.
 *
 * In a one-game match no deal is ever played vulnerable, and that needs no
 * special case here. This is read at the start of a deal, a deal only follows an
 * unfinished match, and winning the game finishes it — so the `true` this
 * returns afterwards is never asked for.
 */
export function vulnerability(rubber: RubberState): Pair<boolean> {
  return [rubber.gamesWon[0] >= 1, rubber.gamesWon[1] >= 1];
}

export function totalScore(rubber: RubberState): Pair<number> {
  return [
    rubber.belowLineTotal[0] + rubber.aboveLine[0],
    rubber.belowLineTotal[1] + rubber.aboveLine[1],
  ];
}

/**
 * Folds one deal's score into the rubber: below-the-line points accumulate as a
 * part-score until they reach 100, which wins a game and redraws the line for
 * both sides. Two games wins the rubber, worth 700 if the loser has no game and
 * 500 otherwise.
 */
export function applyDealScore(rubber: RubberState, score: DealScore): RubberState {
  if (rubber.complete) {
    throw new Error("Cannot score a deal into a completed rubber");
  }

  const aboveLine: Pair<number> = [
    rubber.aboveLine[0] + score.aboveLine[0],
    rubber.aboveLine[1] + score.aboveLine[1],
  ];
  const belowLineTotal: Pair<number> = [
    rubber.belowLineTotal[0] + score.belowLine[0],
    rubber.belowLineTotal[1] + score.belowLine[1],
  ];
  let partScore: Pair<number> = [
    rubber.partScore[0] + score.belowLine[0],
    rubber.partScore[1] + score.belowLine[1],
  ];
  const gamesWon: Pair<number> = [rubber.gamesWon[0], rubber.gamesWon[1]];

  for (const player of [0, 1] as const) {
    if (partScore[player] >= GAME_THRESHOLD) {
      gamesWon[player] += 1;
      partScore = [0, 0];
    }
  }

  // One game in a `game` match, two in a rubber. Everything up to here — the
  // part-score accumulating to 100, the line being redrawn — is identical; the
  // formats differ only in when they stop.
  const target = rubber.format === "game" ? 1 : 2;

  let complete = false;
  let winner: PlayerId | null = null;
  const matchBonus: Pair<number> = [rubber.matchBonus[0], rubber.matchBonus[1]];
  for (const player of [0, 1] as const) {
    if (gamesWon[player] === target) {
      complete = true;
      winner = player;
      const bonus = bonusFor(rubber.format, gamesWon[player === 0 ? 1 : 0]);
      aboveLine[player] += bonus;
      matchBonus[player] = bonus;
    }
  }

  return {
    aboveLine,
    belowLineTotal,
    complete,
    format: rubber.format,
    gamesWon,
    matchBonus,
    partScore,
    winner,
  };
}

/** 700 for a rubber the loser never got a game in, 500 otherwise, 300 for a game. */
function bonusFor(format: MatchFormat, opponentGames: number): number {
  if (format === "game") {
    return GAME_BONUS;
  }
  return opponentGames === 0 ? 700 : 500;
}
