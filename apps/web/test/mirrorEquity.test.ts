import { applyDealScore, newRubber, scoreDeal } from "@hb/engine";
import type { Card, Contract, Pair, PairStanding, PlayerId, RubberState } from "@hb/engine";
import { describe, expect, test } from "vitest";
import { mirrorEquityOf } from "../src/bot/equity.js";

const NOBODY: Pair<readonly Card[]> = [[], []];

function half(number: 1 | 2, carried: Pair<number> = [0, 0]): PairStanding {
  return { carried, half: number };
}

/** A rubber with `points` banked above the line by `seat`, which moves the margin only. */
function ahead(seat: PlayerId, points: number): RubberState {
  const rubber = newRubber("game");
  const aboveLine: Pair<number> = [rubber.aboveLine[0], rubber.aboveLine[1]];
  aboveLine[seat] = aboveLine[seat] + points;
  return { ...rubber, aboveLine };
}

/** A rubber where `seat` has banked a part-score toward the game in play: 2C made. */
function partScore(seat: PlayerId): RubberState {
  const contract: Contract = { declarer: seat, doubling: "none", level: 2, strain: "C" };
  const tricksWon: Pair<number> = [0, 0];
  tricksWon[seat] = 8;
  tricksWon[seat === 0 ? 1 : 0] = 5;
  return applyDealScore(
    newRubber("game"),
    scoreDeal({ contract, hands: NOBODY, tricksWon }, [false, false]),
  );
}

describe("what a two-game match is worth from here", () => {
  /**
   * The property a bidder comparing two futures relies on: a call cannot look good to
   * both seats at once. Imposed by construction rather than fitted — every feature is
   * a difference taken this seat's way and no state carries an intercept — so this is
   * the check on that construction, not on the numbers.
   */
  test("the two seats' chances sum to exactly one", () => {
    const states: { pair: PairStanding; rubber: RubberState }[] = [
      { pair: half(1), rubber: newRubber("game") },
      { pair: half(1), rubber: ahead(0, 340) },
      { pair: half(1), rubber: partScore(1) },
      { pair: half(2, [520, 180]), rubber: newRubber("game") },
      { pair: half(2, [180, 520]), rubber: ahead(0, 260) },
      { pair: half(2, [300, 300]), rubber: partScore(0) },
    ];
    for (const { pair, rubber } of states) {
      const total = mirrorEquityOf(rubber, pair, 0) + mirrorEquityOf(rubber, pair, 1);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  test("a level standing is a coin flip in either half", () => {
    expect(mirrorEquityOf(newRubber("game"), half(1), 0)).toBeCloseTo(0.5, 6);
    expect(mirrorEquityOf(newRubber("game"), half(2, [400, 400]), 0)).toBeCloseTo(0.5, 6);
  });

  /**
   * The branch a rubber has no equivalent of, and the whole reason this function
   * exists rather than `equityOf` with a different table. `equityOf` answers 1 the
   * instant its rubber is complete, because there the rubber *is* the match. Winning
   * the first half of a pair decides nothing: it becomes the number the second half
   * opens at, and the other seat is about to hold your cards.
   */
  test("winning the first half is not winning the match", () => {
    const won = { ...newRubber("game"), complete: true, gamesWon: [1, 0] as Pair<number> };
    const chance = mirrorEquityOf({ ...won, aboveLine: [300, 0] }, half(1), 0);
    expect(chance).toBeGreaterThan(0.5);
    expect(chance).toBeLessThan(0.8);
  });

  test("but winning the second half on aggregate is", () => {
    const won = { ...newRubber("game"), complete: true, gamesWon: [1, 0] as Pair<number> };
    expect(mirrorEquityOf(won, half(2, [500, 100]), 0)).toBe(1);
    expect(mirrorEquityOf(won, half(2, [100, 500]), 0)).toBe(0);
    expect(mirrorEquityOf(won, half(2, [300, 300]), 0)).toBe(0.5);
  });

  /**
   * The measured fact the table exists to carry, and the one a single aggregate
   * feature would have priced away: the boards come back, so a lead you carried is
   * worth less than the same lead banked in the half being played.
   */
  test("a carried point is worth less than one banked in the half being played", () => {
    const carried = mirrorEquityOf(newRubber("game"), half(2, [400, 0]), 0);
    const banked = mirrorEquityOf(ahead(0, 400), half(2, [0, 0]), 0);
    expect(carried).toBeGreaterThan(0.5);
    expect(carried).toBeLessThan(banked);
  });

  /**
   * The mispricing that made this worth building. The single-game cell prices a
   * part-score at +0.95 in both halves; it is worth nothing measurable in the first.
   */
  test("a part-score is worth nothing in the first half and something in the second", () => {
    const first = mirrorEquityOf(partScore(0), half(1), 0);
    const second = mirrorEquityOf(partScore(0), half(2, [0, 0]), 0);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeGreaterThan(0.5);
  });
});
