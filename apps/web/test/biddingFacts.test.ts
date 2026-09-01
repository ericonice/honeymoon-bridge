import { scoreDeal } from "@hb/engine";
import { expect, test } from "vitest";
import { doubledOutcome, trickTargets } from "../src/game/biddingFacts.js";

/**
 * Same discipline as `scoringPage.test.ts`: expectations come from the engine
 * directly, not from `biddingFacts.ts` itself, so a fact and the test that
 * guards it cannot silently agree with each other no matter what either says.
 */

test("trick targets are book-plus-level for declarer and the complement for defender", () => {
  const rows = trickTargets();
  expect(rows).toHaveLength(7);

  for (const row of rows) {
    expect(row.declarer).toBe(row.level + 6);
    expect(row.defender).toBe(8 - row.level);
    // The two always sum to one more than the tricks in a deal.
    expect(row.declarer + row.defender).toBe(14);
  }
});

test("a doubled contract's outcome matches what scoreDeal itself settles", () => {
  const scoredNet = (tricksWon: number, declarerVulnerable: boolean): number => {
    const score = scoreDeal(
      {
        contract: { declarer: 0, doubling: "doubled", level: 4, strain: "H" },
        hands: [[], []],
        tricksWon: [tricksWon, 13 - tricksWon],
      },
      [declarerVulnerable, false],
    );
    return score.belowLine[0] + score.aboveLine[0] - score.belowLine[1] - score.aboveLine[1];
  };

  const outcome = doubledOutcome({ level: 4, strain: "H" });

  expect(outcome.notVulnerable.madeExactly).toBe(scoredNet(10, false));
  expect(outcome.notVulnerable.down).toEqual([
    scoredNet(9, false),
    scoredNet(8, false),
    scoredNet(7, false),
  ]);
  expect(outcome.vulnerable.madeExactly).toBe(scoredNet(10, true));
  expect(outcome.vulnerable.down).toEqual([
    scoredNet(9, true),
    scoredNet(8, true),
    scoredNet(7, true),
  ]);
});

/**
 * The tutorial's central claim about vulnerability: making a doubled contract
 * pays the same whether declarer is vulnerable or not, and only going down
 * moves. If a scoring change ever made made-contracts vulnerability-sensitive
 * this would be the test to catch it.
 */
test("making a doubled contract pays the same regardless of vulnerability", () => {
  const outcome = doubledOutcome({ level: 4, strain: "H" });
  expect(outcome.vulnerable.madeExactly).toBe(outcome.notVulnerable.madeExactly);
});

test("going down doubled costs strictly more when vulnerable", () => {
  const outcome = doubledOutcome({ level: 4, strain: "H" });
  for (let i = 0; i < 3; i++) {
    expect(outcome.vulnerable.down[i]!).toBeLessThan(outcome.notVulnerable.down[i]!);
  }
});
