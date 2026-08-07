import { applyAction, createRng, dealScoreFor, startDeal } from "@hb/engine";
import type { Card, DealState, PlayerId, Rank, Suit } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { bestStrain, defensiveTricks, estimatedTricks, quickTricks } from "../src/bot/evaluate.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { botActionFor } from "../src/game/botTurn.js";

function hand(spec: string): Card[] {
  const ranks: Record<string, Rank> = {
    A: 14, K: 13, Q: 12, J: 11, T: 10,
    "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
  };
  // "S:AK4 H:QJ" — suit letter, colon, then ranks.
  return spec.split(" ").flatMap((group) => {
    const [suit, cards] = group.split(":") as [Suit, string];
    return [...cards].map((rank) => ({ rank: ranks[rank]!, suit }));
  });
}

function playDeal(seed: number, starter: PlayerId): DealState {
  const bot = createHeuristicBot(createRng(seed));
  let state = startDeal({ seed, starter });
  while (state.phase !== "complete") {
    state = applyAction(state, state.toAct, botActionFor(bot, state, state.toAct));
  }
  return state;
}

describe("hand evaluation", () => {
  it("counts the top honours as winners and the rest as nothing", () => {
    expect(quickTricks(hand("S:AK"))).toBe(2);
    expect(quickTricks(hand("S:AQ"))).toBe(1.5);
    expect(quickTricks(hand("S:A"))).toBe(1);
    expect(quickTricks(hand("S:KQ"))).toBe(1);
    expect(quickTricks(hand("S:QJT9"))).toBe(0);
  });

  it("does not credit a bare king, which falls to the ace", () => {
    expect(quickTricks(hand("S:K"))).toBe(0);
    expect(quickTricks(hand("S:K2"))).toBe(0.5);
  });

  it("values a long trump suit above a short one", () => {
    const long = hand("S:AK98765 H:43 D:432 C:2");
    const short = hand("S:AK9 H:8765 D:432 C:32");

    expect(estimatedTricks(long, "S")).toBeGreaterThan(estimatedTricks(short, "S"));
  });

  it("picks the long suit as trumps over a scattered no-trump holding", () => {
    expect(bestStrain(hand("S:AKQ8765 H:43 D:43 C:32")).strain).toBe("S");
  });

  it("prefers no-trump when the strength is spread and no suit is long", () => {
    // Every suit is guarded and nothing is longer than four, so naming a trump
    // suit would trade that suit's winners for length it does not have.
    expect(bestStrain(hand("S:AK4 H:AK4 D:A43 C:AK32")).strain).toBe("NT");
  });

  it("still names a trump suit when a four-card holding is weak", () => {
    // Four small clubs are worth more as trumps than as stoppers.
    expect(bestStrain(hand("S:AK4 H:AK4 D:AK4 C:A432")).strain).toBe("C");
  });

  it("measures defence from winners across the whole hand", () => {
    expect(defensiveTricks(hand("S:AK H:A2 D:K2 C:432"))).toBe(3.5);
    expect(defensiveTricks(hand("S:8765 H:432 D:432 C:32"))).toBe(0);
  });
});

describe("the bidding bot", () => {
  it("never makes an illegal call across many deals", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const finished = playDeal(seed, (seed % 2) as PlayerId);
      expect(finished.phase).toBe("complete");
    }
  });

  it("bids contracts it can actually make", () => {
    // Deliberately not asserting the level. The random bidder averaged about
    // four, and this bot has climbed past three as its card play improved — the
    // level alone never distinguished judgement from noise. What separates them
    // is that random bidding made 1% of its contracts and this makes most of
    // them, which stays true however the evaluation is tuned.
    let made = 0;
    let played = 0;

    for (let seed = 1; seed <= 300; seed++) {
      const finished = playDeal(seed, (seed % 2) as PlayerId);
      const score = dealScoreFor(finished, [false, false]);
      if (score === null) {
        continue;
      }
      played++;
      if (score.detail.made) {
        made++;
      }
    }

    expect(played).toBeGreaterThan(250);
    expect(made / played).toBeGreaterThan(0.5);
  });

  it("settles most deals into a contract instead of passing them out", () => {
    let passed = 0;
    for (let seed = 500; seed < 700; seed++) {
      if (playDeal(seed, 0).passedOut) {
        passed++;
      }
    }
    expect(passed).toBeLessThan(30);
  });
});

