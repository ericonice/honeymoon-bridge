import { describe, expect, it } from "vitest";
import { scoreDeal, TRICKS, trickOutlook, trickTarget } from "../src/scoring.js";
import type { Card, Contract, Level, Pair, PlayerId } from "../src/types.js";

const LEVELS: readonly Level[] = [1, 2, 3, 4, 5, 6, 7];

const NO_HONORS: Pair<readonly Card[]> = [
  [{ rank: 2, suit: "C" }],
  [{ rank: 3, suit: "D" }],
];

function contract(level: Level): Contract {
  return { declarer: 0, doubling: "none", level, strain: "S" };
}

function outlook(level: Level, seat: PlayerId, mine: number, theirs: number) {
  const tricksWon: Pair<number> = seat === 0 ? [mine, theirs] : [theirs, mine];
  return trickOutlook({ contract: contract(level), seat, tricksWon });
}

describe("trickTarget", () => {
  it("asks declarer for the book plus the level", () => {
    expect(trickTarget(contract(4), 0)).toBe(10);
    expect(trickTarget(contract(1), 0)).toBe(7);
    expect(trickTarget(contract(7), 0)).toBe(13);
  });

  it("asks the defender for one more than that leaves", () => {
    expect(trickTarget(contract(4), 1)).toBe(4);
    expect(trickTarget(contract(1), 1)).toBe(7);
    expect(trickTarget(contract(7), 1)).toBe(1);
  });

  // This is what makes the deal undrawable, and it is the reason the two seats
  // can share one widget: exactly one of them can ever arrive.
  it("sets the two targets one apart from splitting the deal", () => {
    for (const level of LEVELS) {
      expect(trickTarget(contract(level), 0) + trickTarget(contract(level), 1)).toBe(TRICKS + 1);
    }
  });
});

describe("trickOutlook", () => {
  it("counts down what is still needed", () => {
    expect(outlook(4, 0, 0, 0).need).toBe(10);
    expect(outlook(4, 0, 6, 2).need).toBe(4);
    expect(outlook(4, 1, 1, 3).need).toBe(3);
  });

  it("stays open for as long as the target is reachable at all", () => {
    expect(outlook(4, 0, 6, 1).state).toBe("open");
    expect(outlook(4, 1, 0, 0).state).toBe("open");
    // Right down to needing every remaining trick, which is still winnable and so
    // is not a state of its own: finer gradations were tried and removed, since
    // both seats' outlooks are on screen and the opponent's count says the same.
    const edge = outlook(4, 0, 7, 3);
    expect(edge.need).toBe(3);
    expect(edge.remaining).toBe(3);
    expect(edge.state).toBe("open");
  });

  it("is gone while tricks are still to be played", () => {
    const gone = outlook(4, 0, 7, 4);
    expect(gone.state).toBe("gone");
    expect(gone.remaining).toBe(2);
  });

  it("is reached the moment the target arrives, whatever is left over", () => {
    expect(outlook(4, 0, 10, 2).state).toBe("reached");
    expect(outlook(4, 0, 10, 2).need).toBe(0);
    // Overtricks do not push it past reached, and never make `need` negative.
    expect(outlook(4, 0, 12, 1).need).toBe(0);
  });

  it("is reached, gone or open and never ambiguously two of them", () => {
    for (const level of LEVELS) {
      for (let mine = 0; mine <= TRICKS; mine += 1) {
        for (let theirs = 0; theirs + mine <= TRICKS; theirs += 1) {
          for (const seat of [0, 1] as const) {
            const r = trickOutlook({ contract: contract(level), seat, tricksWon: [mine, theirs] });
            if (r.state === "reached") {
              expect(r.need).toBe(0);
            } else if (r.state === "gone") {
              expect(r.need).toBeGreaterThan(r.remaining);
            } else {
              expect(r.need).toBeGreaterThan(0);
              expect(r.need).toBeLessThanOrEqual(r.remaining);
            }
          }
        }
      }
    }
  });

  it("never has both seats reaching their own target", () => {
    for (const level of LEVELS) {
      for (let mine = 0; mine <= TRICKS; mine += 1) {
        for (let theirs = 0; theirs + mine <= TRICKS; theirs += 1) {
          const declarer = trickOutlook({ contract: contract(level), seat: 0, tricksWon: [mine, theirs] });
          const defender = trickOutlook({ contract: contract(level), seat: 1, tricksWon: [mine, theirs] });
          expect(declarer.state === "reached" && defender.state === "reached").toBe(false);
          // And a decided deal is decided for exactly one of them.
          expect(declarer.state === "gone").toBe(defender.state === "reached");
        }
      }
    }
  });

  /**
   * The reason the state is derived rather than stored. `scoreDeal` is the only
   * authority on whether a contract made, so a seat told it had reached its target
   * and then scored as having lost the deal would be the same class of bug as two
   * hosts advancing a rubber differently.
   */
  it("agrees with scoreDeal on every finished deal", () => {
    for (const level of LEVELS) {
      for (let taken = 0; taken <= TRICKS; taken += 1) {
        const tricksWon: Pair<number> = [taken, TRICKS - taken];
        const { detail } = scoreDeal({ contract: contract(level), hands: NO_HONORS, tricksWon }, [false, false]);
        const declarer = trickOutlook({ contract: contract(level), seat: 0, tricksWon });
        const defender = trickOutlook({ contract: contract(level), seat: 1, tricksWon });

        expect(declarer.state).toBe(detail.made ? "reached" : "gone");
        expect(defender.state).toBe(detail.made ? "gone" : "reached");
      }
    }
  });
});
