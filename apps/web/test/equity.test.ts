import { newRubber } from "@hb/engine";
import type { Pair, RubberState } from "@hb/engine";
import { describe, expect, test } from "vitest";
import { equityOf, pointsAsEquity } from "../src/bot/equity.js";
import { creditIn } from "../src/bot/heuristicBot.js";

function standing(options: {
  above?: Pair<number>;
  complete?: boolean;
  games?: Pair<number>;
  part?: Pair<number>;
  winner?: 0 | 1 | null;
}): RubberState {
  const part = options.part ?? [0, 0];
  return {
    ...newRubber(),
    aboveLine: options.above ?? [0, 0],
    belowLineTotal: part,
    complete: options.complete ?? false,
    gamesWon: options.games ?? [0, 0],
    partScore: part,
    winner: options.winner ?? null,
  };
}

describe("the equity table", () => {
  /**
   * The property a bidder comparing two futures depends on. A table that only
   * nearly had it would let the same call look good to both seats at once, which
   * is not a rounding error but a bidder that can talk itself into anything.
   */
  test("the two seats' chances always sum to one", () => {
    const cases: RubberState[] = [
      standing({}),
      standing({ games: [1, 0] }),
      standing({ games: [0, 1] }),
      standing({ games: [1, 1] }),
      standing({ part: [60, 0] }),
      standing({ part: [0, 90] }),
      standing({ above: [700, 0], games: [1, 1], part: [30, 60] }),
      standing({ above: [0, 1200], games: [0, 1] }),
    ];
    for (const rubber of cases) {
      expect(equityOf(rubber, 0) + equityOf(rubber, 1)).toBeCloseTo(1, 10);
    }
  });

  test("a symmetric standing is even money for both seats", () => {
    expect(equityOf(standing({}), 0)).toBeCloseTo(0.5, 10);
    expect(equityOf(standing({ games: [1, 1] }), 0)).toBeCloseTo(0.5, 10);
  });

  test("a game up mirrors a game down exactly", () => {
    const up = equityOf(standing({ games: [1, 0] }), 0);
    const down = equityOf(standing({ games: [0, 1] }), 0);
    expect(up).toBeCloseTo(1 - down, 10);
    expect(up).toBeGreaterThan(0.5);
  });

  /** A finished rubber is not a forecast — the bonus is already on the pad. */
  test("a decided rubber is one or zero, not a probability", () => {
    expect(equityOf(standing({ complete: true, games: [2, 0], winner: 0 }), 0)).toBe(1);
    expect(equityOf(standing({ complete: true, games: [2, 0], winner: 0 }), 1)).toBe(0);
  });

  /**
   * The finding the flat constant could not express, asserted so it cannot
   * quietly stop being true: the same part-score is worth more when a game each
   * has been won and the next one takes the rubber.
   */
  test("a part-score is worth more at one game each than at love all", () => {
    const atLevel = equityOf(standing({ part: [60, 0] }), 0) - 0.5;
    const atOneEach = equityOf(standing({ games: [1, 1], part: [60, 0] }), 0) - 0.5;
    expect(atOneEach).toBeGreaterThan(atLevel * 1.5);
  });

  test("holding a game is worth more than four hundred points of score", () => {
    const game = equityOf(standing({ games: [1, 0] }), 0) - 0.5;
    expect(game).toBeGreaterThan(pointsAsEquity(standing({}), 0, 400));
  });

  test("a credit is worth something, and nothing to the seat that did not get it", () => {
    expect(pointsAsEquity(standing({}), 0, 200)).toBeGreaterThan(0);
    expect(pointsAsEquity(standing({}), 0, 0)).toBe(0);
  });

  /**
   * The disguise credit is the one constant that has to exist in both currencies,
   * and getting it wrong is not subtle: 200 added to a probability beats every
   * honest bid on the board, so the bot would open almost every deal on a
   * disguise.
   */
  test("the disguise credit is converted rather than added raw", () => {
    const at = standing({});
    const points = creditIn("points", { rubber: at, vulnerable: [false, false] }, 0, 200);
    const equity = creditIn("equity", { rubber: at, vulnerable: [false, false] }, 0, 200);

    expect(points).toBe(200);
    expect(equity).toBe(pointsAsEquity(at, 0, 200));
    // On the scale a probability lives on, not the scale points live on.
    expect(equity).toBeLessThan(0.1);
    expect(equity).toBeGreaterThan(0);
  });

  test("no credit is no credit, in either currency", () => {
    const at = { rubber: standing({}), vulnerable: [false, false] as Pair<boolean> };
    expect(creditIn("points", at, 0, 0)).toBe(0);
    expect(creditIn("equity", at, 0, 0)).toBe(0);
  });

  /**
   * A one-game match has its own cell, fitted from single games rather than
   * borrowed from the rubber. Borrowing was what the code did first, and the
   * numbers are why it stopped: a part-score is worth nearly three times as much
   * here as at the same nothing-to-nothing standing in a rubber, because here it is
   * progress toward the whole match.
   */
  test("a short match is priced by its own numbers, not the rubber's", () => {
    const short = { ...newRubber("game"), belowLineTotal: [60, 0] as Pair<number>, partScore: [60, 0] as Pair<number> };
    const long = standing({ part: [60, 0] });
    expect(equityOf(short, 0)).toBeGreaterThan(equityOf(long, 0));
  });

  test("a short match's two seats also sum to one", () => {
    const short = { ...newRubber("game"), belowLineTotal: [60, 0] as Pair<number>, partScore: [60, 0] as Pair<number> };
    expect(equityOf(short, 0) + equityOf(short, 1)).toBeCloseTo(1, 10);
    expect(equityOf(newRubber("game"), 0)).toBeCloseTo(0.5, 10);
  });
});
