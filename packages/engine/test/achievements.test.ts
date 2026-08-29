import { describe, expect, it } from "vitest";
import {
  dealFacts,
  dealUnlocks,
  rubberFacts,
  rubberUnlocks,
  tierForCount,
  unlockKey,
  withImpliedTiers,
} from "../src/achievements.js";
import type { AchievementProgress, DealFacts } from "../src/achievements.js";
import { newRubber } from "../src/rubber.js";
import { scoreDeal } from "../src/scoring.js";
import type { DealRecord } from "../src/table.js";
import type { RubberState } from "../src/rubber.js";
import type { DealScore } from "../src/scoring.js";
import type {
  Card,
  Contract,
  DealState,
  Doubling,
  Level,
  Pair,
  PlayerId,
  Rank,
  Strain,
  Suit,
} from "../src/types.js";
import type { TableSummary } from "../src/table.js";

const NOTHING_HELD: AchievementProgress = { counters: {}, unlocked: new Set() };

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function contractOf(
  level: Level,
  strain: Strain,
  doubling: Doubling = "none",
  declarer: PlayerId = 0,
): Contract {
  return { declarer, doubling, level, strain };
}

function scoreFor(
  contract: Contract,
  tricksWon: Pair<number>,
  vulnerable: Pair<boolean> = [false, false],
): DealScore {
  return scoreDeal({ contract, hands: [[], []], tricksWon }, vulnerable);
}

function baseDeal(overrides: Partial<DealState> = {}): DealState {
  return {
    auction: [],
    claim: null,
    completedTricks: [],
    contract: null,
    currentTrick: [],
    discards: [[], []],
    drawTurns: [],
    hands: [[], []],
    initialHands: [[], []],
    lastDraws: [null, null],
    passedOut: false,
    pending: null,
    phase: "complete",
    revealed: null,
    starter: 0,
    stock: [],
    toAct: 0,
    trickLeader: 0,
    tricksWon: [0, 0],
    ...overrides,
  };
}

describe("slam", () => {
  it("reaches bronze for a made small slam", () => {
    const contract = contractOf(6, "S");
    const score = scoreFor(contract, [12, 1]);
    const state = baseDeal({ contract, tricksWon: [12, 1] });

    const facts = dealFacts(state, score, [false, false]);
    expect(facts.slamTier).toEqual(["bronze", null]);
    expect(facts.handWonBy).toBe(0);
  });

  it("reaches silver for a made grand slam", () => {
    const contract = contractOf(7, "S");
    const score = scoreFor(contract, [13, 0]);
    const state = baseDeal({ contract, tricksWon: [13, 0] });

    expect(dealFacts(state, score, [false, false]).slamTier).toEqual(["silver", null]);
  });

  it("reaches gold for a made grand slam vulnerable", () => {
    const contract = contractOf(7, "S");
    const score = scoreFor(contract, [13, 0], [true, false]);
    const state = baseDeal({ contract, tricksWon: [13, 0] });

    expect(dealFacts(state, score, [true, false]).slamTier).toEqual(["gold", null]);
  });

  it("reaches no tier when the slam is not made", () => {
    const contract = contractOf(6, "S");
    const score = scoreFor(contract, [10, 3]);
    const state = baseDeal({ contract, tricksWon: [10, 3] });

    expect(dealFacts(state, score, [false, false]).slamTier).toEqual([null, null]);
  });
});

describe("the insult", () => {
  it("reaches bronze for a made doubled contract", () => {
    const contract = contractOf(3, "S", "doubled");
    const score = scoreFor(contract, [9, 4]);
    const state = baseDeal({ contract, tricksWon: [9, 4] });

    expect(dealFacts(state, score, [false, false]).insultTier).toEqual(["bronze", null]);
  });

  it("reaches silver for a made redoubled contract", () => {
    const contract = contractOf(3, "S", "redoubled");
    const score = scoreFor(contract, [9, 4]);
    const state = baseDeal({ contract, tricksWon: [9, 4] });

    expect(dealFacts(state, score, [false, false]).insultTier).toEqual(["silver", null]);
  });

  it("reaches gold for a made redoubled contract vulnerable", () => {
    const contract = contractOf(3, "S", "redoubled");
    const score = scoreFor(contract, [9, 4], [true, false]);
    const state = baseDeal({ contract, tricksWon: [9, 4] });

    expect(dealFacts(state, score, [true, false]).insultTier).toEqual(["gold", null]);
  });

  it("reaches no tier for an undoubled contract", () => {
    const contract = contractOf(3, "S");
    const score = scoreFor(contract, [9, 4]);
    const state = baseDeal({ contract, tricksWon: [9, 4] });

    expect(dealFacts(state, score, [false, false]).insultTier).toEqual([null, null]);
  });
});

describe("the axe", () => {
  function setBy(undertricks: number) {
    const contract = contractOf(4, "S");
    const taken = 10 - undertricks;
    const score = scoreFor(contract, [taken, 13 - taken]);
    const state = baseDeal({ contract, tricksWon: [taken, 13 - taken] });
    return dealFacts(state, score, [false, false]);
  }

  it("reaches bronze for a set of 3", () => {
    expect(setBy(3).setTier).toEqual([null, "bronze"]);
    expect(setBy(3).handWonBy).toBe(1);
  });

  it("reaches silver for a set of 5", () => {
    expect(setBy(5).setTier).toEqual([null, "silver"]);
  });

  it("reaches gold for a set of 7", () => {
    expect(setBy(7).setTier).toEqual([null, "gold"]);
  });

  it("reaches no tier for a set of 2", () => {
    expect(setBy(2).setTier).toEqual([null, null]);
  });

  /**
   * The bug this was reported as: a gold with the silver below it still locked,
   * and no obvious way to get the silver except by setting a contract by exactly
   * five. Having beaten one by seven, that rung is climbed.
   */
  it("awards every tier below the one it reached", () => {
    const keys = dealUnlocks(NOTHING_HELD, setBy(7), 1)
      .unlocked.filter((unlock) => unlock.achievement === "axe")
      .map((unlock) => unlock.tier)
      .sort();
    expect(keys).toEqual(["bronze", "gold", "silver"]);
  });

  it("awards only what a smaller set reached", () => {
    const keys = dealUnlocks(NOTHING_HELD, setBy(5), 1)
      .unlocked.filter((unlock) => unlock.achievement === "axe")
      .map((unlock) => unlock.tier)
      .sort();
    expect(keys).toEqual(["bronze", "silver"]);
  });

  it("does not re-offer a tier already held", () => {
    const holding: AchievementProgress = {
      counters: {},
      unlocked: new Set([unlockKey({ achievement: "axe", tier: "bronze" })]),
    };
    const keys = dealUnlocks(holding, setBy(7), 1)
      .unlocked.filter((unlock) => unlock.achievement === "axe")
      .map((unlock) => unlock.tier)
      .sort();
    expect(keys).toEqual(["gold", "silver"]);
  });
});

describe("tiers implying one another", () => {
  it("fills in the rungs below a held tier", () => {
    expect(withImpliedTiers([{ achievement: "slam", tier: "gold" }]).map(unlockKey).sort()).toEqual([
      "slam:bronze",
      "slam:gold",
      "slam:silver",
    ]);
  });

  it("leaves a bronze alone", () => {
    expect(withImpliedTiers([{ achievement: "insult", tier: "bronze" }])).toEqual([
      { achievement: "insult", tier: "bronze" },
    ]);
  });

  it("adds nothing twice, so reading a list repeatedly is safe", () => {
    const once = withImpliedTiers([{ achievement: "axe", tier: "silver" }]);
    expect(withImpliedTiers(once).map(unlockKey).sort()).toEqual(once.map(unlockKey).sort());
  });

  it("keeps families apart", () => {
    const keys = withImpliedTiers([
      { achievement: "axe", tier: "silver" },
      { achievement: "slam", tier: "bronze" },
    ])
      .map(unlockKey)
      .sort();
    expect(keys).toEqual(["axe:bronze", "axe:silver", "slam:bronze"]);
  });
});

describe("two-suiter", () => {
  it("is true for a hand confined to two suits", () => {
    const hands: Pair<readonly Card[]> = [
      [card(2, "C"), card(3, "C"), card(4, "D")],
      [card(2, "H"), card(3, "D"), card(4, "S")],
    ];
    const state = baseDeal({ initialHands: hands });

    expect(dealFacts(state, null, [false, false]).twoSuited).toEqual([true, false]);
  });

  it("is true for a hand confined to one suit", () => {
    const hands: Pair<readonly Card[]> = [[card(2, "C"), card(3, "C")], []];
    const state = baseDeal({ initialHands: hands });

    expect(dealFacts(state, null, [false, false]).twoSuited[0]).toBe(true);
  });

  it("is false once a third suit appears", () => {
    const hands: Pair<readonly Card[]> = [
      [card(2, "C"), card(3, "D"), card(4, "H")],
      [],
    ];
    const state = baseDeal({ initialHands: hands });

    expect(dealFacts(state, null, [false, false]).twoSuited[0]).toBe(false);
  });
});

describe("nobody wanted it", () => {
  it("is true, and hand-won is null, for a passed-out deal", () => {
    const state = baseDeal({ passedOut: true });

    const facts = dealFacts(state, null, [false, false]);
    expect(facts.nobodyWantedIt).toBe(true);
    expect(facts.handWonBy).toBeNull();
  });

  it("is false for an ordinary scored deal", () => {
    const contract = contractOf(3, "S");
    const score = scoreFor(contract, [9, 4]);
    const state = baseDeal({ contract, tricksWon: [9, 4] });

    expect(dealFacts(state, score, [false, false]).nobodyWantedIt).toBe(false);
  });
});

describe("against the odds", () => {
  it("counts each player's card-2-sight-unseen turns separately", () => {
    const state = baseDeal({
      drawTurns: [
        { by: 0, choice: "took-second" },
        { by: 1, choice: "kept-first" },
        { by: 0, choice: "took-second" },
        { by: 1, choice: "took-second" },
      ],
    });

    expect(dealFacts(state, null, [false, false]).rejections).toEqual([2, 1]);
  });
});

describe("rubber facts", () => {
  function summaryWith(rubber: RubberState, history: readonly DealRecord[]): TableSummary {
    return { history, rubber, score: null, vulnerable: [false, false] };
  }

  const record = (wonGameBy: PlayerId | null): DealRecord => ({
    contract: null,
    score: null,
    starter: 0,
    tricksWon: [0, 0],
    wonGameBy,
  });

  it("names nobody while the rubber is still in progress", () => {
    const summary = summaryWith(newRubber(), [record(0)]);
    expect(rubberFacts(summary)).toEqual({
      comebackWinner: null,
      handsPlayed: null,
      sweepWinner: null,
      wonRubber: null,
    });
  });

  it("names the winner once the rubber completes", () => {
    const rubber: RubberState = { ...newRubber(), complete: true, gamesWon: [2, 1], winner: 0 };
    const summary = summaryWith(rubber, [record(1), record(0), record(0)]);

    expect(rubberFacts(summary).wonRubber).toBe(0);
  });

  it("reaches a sweep only when the loser never won a game", () => {
    const sweep: RubberState = { ...newRubber(), complete: true, gamesWon: [2, 0], winner: 0 };
    const notSwept: RubberState = { ...newRubber(), complete: true, gamesWon: [2, 1], winner: 0 };

    expect(rubberFacts(summaryWith(sweep, [record(0), record(0)])).sweepWinner).toBe(0);
    expect(
      rubberFacts(summaryWith(notSwept, [record(1), record(0), record(0)])).sweepWinner,
    ).toBeNull();
  });

  it("credits a comeback only when the winner lost the rubber's first game", () => {
    const rubber: RubberState = { ...newRubber(), complete: true, gamesWon: [2, 1], winner: 0 };
    const cameBack = summaryWith(rubber, [record(1), record(0), record(0)]);
    const wireToWire = summaryWith(rubber, [record(0), record(1), record(0)]);

    expect(rubberFacts(cameBack).comebackWinner).toBe(0);
    expect(rubberFacts(wireToWire).comebackWinner).toBeNull();
  });

  it("names nobody for a won single game, which is not a rubber", () => {
    // A one-game match is always at [1, 0] when it completes — indistinguishable
    // from a sweep by `gamesWon` alone, which is exactly why format has to be
    // checked rather than inferred from the score.
    const match: RubberState = { ...newRubber("game"), complete: true, gamesWon: [1, 0], winner: 0 };
    const summary = summaryWith(match, [record(0)]);

    expect(rubberFacts(summary)).toEqual({
      comebackWinner: null,
      handsPlayed: null,
      sweepWinner: null,
      wonRubber: null,
    });
  });

  it("counts every deal of the rubber, including the one that just finished it", () => {
    const rubber: RubberState = { ...newRubber(), complete: true, gamesWon: [2, 0], winner: 0 };
    const summary = summaryWith(rubber, [record(0), record(0)]);

    expect(rubberFacts(summary).handsPlayed).toBe(2);
  });
});

describe("tierForCount", () => {
  const thresholds: readonly [number, number, number] = [50, 250, 1000];

  it("reaches no tier below the first threshold", () => {
    expect(tierForCount(49, thresholds)).toBeNull();
  });

  it("reaches bronze, silver and gold at each threshold", () => {
    expect(tierForCount(50, thresholds)).toBe("bronze");
    expect(tierForCount(250, thresholds)).toBe("silver");
    expect(tierForCount(1000, thresholds)).toBe("gold");
  });

  it("keeps the highest tier reached beyond its threshold", () => {
    expect(tierForCount(5000, thresholds)).toBe("gold");
  });
});

describe("dealUnlocks", () => {
  function noFacts(overrides: Partial<DealFacts> = {}): DealFacts {
    return {
      handWonBy: null,
      insultTier: [null, null],
      nobodyWantedIt: false,
      rejections: [0, 0],
      setTier: [null, null],
      slamTier: [null, null],
      twoSuited: [false, false],
      ...overrides,
    };
  }

  it("unlocks a one-shot achievement nobody already holds", () => {
    const facts = noFacts({ slamTier: ["bronze", null] });
    const update = dealUnlocks(NOTHING_HELD, facts, 0);

    expect(update.unlocked).toEqual([{ achievement: "slam", tier: "bronze" }]);
  });

  it("does not re-unlock a tier already held", () => {
    const facts = noFacts({ slamTier: ["bronze", null] });
    const held: AchievementProgress = {
      counters: {},
      unlocked: new Set([unlockKey({ achievement: "slam", tier: "bronze" })]),
    };

    expect(dealUnlocks(held, facts, 0).unlocked).toEqual([]);
  });

  it("counts hands played, won and lost regardless of tier", () => {
    const facts = noFacts({ handWonBy: 0 });

    const winner = dealUnlocks(NOTHING_HELD, facts, 0);
    expect(winner.counters).toEqual({ "hands-played": 1, "hands-won": 1 });

    const loser = dealUnlocks(NOTHING_HELD, facts, 1);
    expect(loser.counters).toEqual({ "hands-lost": 1, "hands-played": 1 });
  });

  it("unlocks a counter tier only on the deal that crosses it", () => {
    const facts = noFacts({ handWonBy: 0 });
    const oneShortOfBronze: AchievementProgress = {
      counters: { "hands-won": 49 },
      unlocked: new Set(),
    };

    const update = dealUnlocks(oneShortOfBronze, facts, 0);
    expect(update.counters["hands-won"]).toBe(50);
    expect(update.unlocked).toContainEqual({ achievement: "hands-won", tier: "bronze" });
  });

  it("reports a counter's new value without unlocking anything mid-tier", () => {
    const facts = noFacts({ handWonBy: 0 });
    const midBronze: AchievementProgress = {
      counters: { "hands-won": 60 },
      unlocked: new Set([unlockKey({ achievement: "hands-won", tier: "bronze" })]),
    };

    const update = dealUnlocks(midBronze, facts, 0);
    expect(update.counters["hands-won"]).toBe(61);
    expect(update.unlocked).toEqual([]);
  });
});

describe("rubberUnlocks", () => {
  it("unlocks nothing while the rubber has not completed", () => {
    const facts = { comebackWinner: null, handsPlayed: null, sweepWinner: null, wonRubber: null };
    expect(rubberUnlocks(NOTHING_HELD, facts, 0)).toEqual({ counters: {}, unlocked: [] });
  });

  it("unlocks both take-the-rubber tiers at once on a sweep", () => {
    const facts = {
      comebackWinner: null,
      handsPlayed: 5,
      sweepWinner: 0 as PlayerId,
      wonRubber: 0 as PlayerId,
    };
    const update = rubberUnlocks(NOTHING_HELD, facts, 0);

    expect(update.unlocked).toContainEqual({ achievement: "take-the-rubber", tier: "bronze" });
    expect(update.unlocked).toContainEqual({ achievement: "take-the-rubber", tier: "silver" });
    expect(update.unlocked).not.toContainEqual({ achievement: "take-the-rubber", tier: "gold" });
  });

  it("also unlocks gold when the sweep took exactly two hands", () => {
    const facts = {
      comebackWinner: null,
      handsPlayed: 2,
      sweepWinner: 0 as PlayerId,
      wonRubber: 0 as PlayerId,
    };
    const update = rubberUnlocks(NOTHING_HELD, facts, 0);

    expect(update.unlocked).toContainEqual({ achievement: "take-the-rubber", tier: "gold" });
  });

  it("does not unlock gold for a sweep that took more than two hands", () => {
    const facts = {
      comebackWinner: null,
      handsPlayed: 4,
      sweepWinner: 0 as PlayerId,
      wonRubber: 0 as PlayerId,
    };
    const update = rubberUnlocks(NOTHING_HELD, facts, 0);

    expect(update.unlocked).not.toContainEqual({ achievement: "take-the-rubber", tier: "gold" });
  });

  it("unlocks sitzfleisch for the winner of a rubber that ran past 20 hands", () => {
    const facts = {
      comebackWinner: null,
      handsPlayed: 21,
      sweepWinner: null,
      wonRubber: 0 as PlayerId,
    };
    const winner = rubberUnlocks(NOTHING_HELD, facts, 0);
    const loser = rubberUnlocks(NOTHING_HELD, facts, 1);

    expect(winner.unlocked).toContainEqual({ achievement: "sitzfleisch", tier: "bronze" });
    expect(loser.unlocked).not.toContainEqual({ achievement: "sitzfleisch", tier: "bronze" });
  });

  it("does not unlock sitzfleisch at exactly 20 hands", () => {
    const facts = {
      comebackWinner: null,
      handsPlayed: 20,
      sweepWinner: null,
      wonRubber: 0 as PlayerId,
    };
    expect(rubberUnlocks(NOTHING_HELD, facts, 0).unlocked).not.toContainEqual({
      achievement: "sitzfleisch",
      tier: "bronze",
    });
  });

  it("always bumps marathon, win or lose", () => {
    const facts = { comebackWinner: null, handsPlayed: null, sweepWinner: null, wonRubber: 0 as PlayerId };

    expect(rubberUnlocks(NOTHING_HELD, facts, 0).counters.marathon).toBe(1);
    expect(rubberUnlocks(NOTHING_HELD, facts, 1).counters.marathon).toBe(1);
  });
});
