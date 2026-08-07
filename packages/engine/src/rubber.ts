import type { DealScore } from "./scoring.js";
import type { Pair, PlayerId } from "./types.js";

const GAME_THRESHOLD = 100;

export interface RubberState {
  /** Bonuses, penalties, overtricks and honors. Never counts toward game. */
  readonly aboveLine: Pair<number>;
  /** Every below-the-line point ever scored, including games already won. */
  readonly belowLineTotal: Pair<number>;
  readonly complete: boolean;
  readonly gamesWon: Pair<number>;
  /** Below-the-line points toward the game currently in progress. Wiped when a game is won. */
  readonly partScore: Pair<number>;
  readonly winner: PlayerId | null;
}

export function newRubber(): RubberState {
  return {
    aboveLine: [0, 0],
    belowLineTotal: [0, 0],
    complete: false,
    gamesWon: [0, 0],
    partScore: [0, 0],
    winner: null,
  };
}

/** A side is vulnerable once it has won a game. */
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

  let complete = false;
  let winner: PlayerId | null = null;
  for (const player of [0, 1] as const) {
    if (gamesWon[player] === 2) {
      complete = true;
      winner = player;
      aboveLine[player] += gamesWon[player === 0 ? 1 : 0] === 0 ? 700 : 500;
    }
  }

  return { aboveLine, belowLineTotal, complete, gamesWon, partScore, winner };
}
