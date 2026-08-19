import { applyAction, startDeal, viewFor } from "@hb/engine";
import type { Card, PlayerId, Rank, Suit } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { shouldKeepCard } from "../src/bot/drawDecision.js";
import { highCardPoints } from "../src/bot/evaluate.js";

const RANKS: Record<string, Rank> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10,
  "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};

function hand(spec: string): Card[] {
  if (spec === "") {
    return [];
  }
  return spec.split(" ").flatMap((group) => {
    const [suit, cards] = group.split(":") as [Suit, string];
    return [...cards].map((rank) => ({ rank: RANKS[rank]!, suit }));
  });
}

function card(rank: string, suit: Suit): Card {
  return { rank: RANKS[rank]!, suit };
}

/** Both seats draw by the heuristic; returns the completed hands. */
function drawOut(seed: number): { hands: readonly Card[][]; turns: number } {
  let state = startDeal({ seed, starter: 0 });
  let turns = 0;
  while (state.phase === "draw") {
    const seat = state.toAct;
    state = applyAction(state, seat, {
      type: "draw-decide",
      take: shouldKeepCard(viewFor(state, seat).hand, state.pending!) ? "first" : "second",
    });
    turns++;
  }
  return { hands: [[...state.hands[0]], [...state.hands[1]]], turns };
}

describe("the draw decision", () => {
  it("keeps an ace over an unknown card", () => {
    expect(shouldKeepCard(hand("S:8765 H:432"), card("A", "D"))).toBe(true);
  });

  it("keeps a high honor on the very first turn", () => {
    // A lone king in a finished hand falls to the ace and is worth nothing. On
    // turn one it is not bare, it is early — there are twelve turns left for it
    // to be guarded, and judging it by the finished-hand rule threw kings away.
    expect(shouldKeepCard([], card("K", "S"))).toBe(true);
    expect(shouldKeepCard([], card("Q", "S"))).toBe(true);
    expect(shouldKeepCard([], card("A", "S"))).toBe(true);
  });

  it("rejects a low card in a suit it has no interest in", () => {
    expect(shouldKeepCard(hand("S:AKQJT98 H:AK"), card("2", "D"))).toBe(false);
  });

  it("keeps a low card that lengthens the suit it is already long in", () => {
    const long = hand("S:KQJT9 H:A2 D:32");
    // The same rank, in the long suit and outside it.
    expect(shouldKeepCard(long, card("4", "S"))).toBe(true);
    expect(shouldKeepCard(long, card("4", "C"))).toBe(false);
  });

  it("values a second long suit, not just the first", () => {
    const twoSuited = hand("S:KQJT9 H:KQJT9");
    expect(shouldKeepCard(twoSuited, card("8", "H"))).toBe(true);
  });

  it("gambles rather than keep a card that adds nothing", () => {
    // On the first turn a nine is worth exactly nothing — no trick, no length
    // worth having yet — while an unknown card might be an ace. Rejecting is
    // not throwing the card away, it is taking the better of two bets.
    expect(shouldKeepCard([], card("9", "S"))).toBe(false);
    expect(shouldKeepCard([], card("A", "S"))).toBe(true);
  });

  it("keeps a card once the hand gives it somewhere to belong", () => {
    // The same nine, once there are four spades for it to join.
    expect(shouldKeepCard(hand("S:8765 H:432"), card("9", "S"))).toBe(true);
  });

  it("still spends exactly 26 turns and fills both hands", () => {
    const { hands, turns } = drawOut(4242);

    expect(turns).toBe(26);
    expect(hands[0]).toHaveLength(13);
    expect(hands[1]).toHaveLength(13);
  });

  it("builds better hands than chance across many deals", () => {
    // Twenty-six cards of a shuffled deck hold about half of the 40 high-card
    // points, so a hand drawn without judgment averages around 10.
    let points = 0;
    const deals = 40;
    for (let seed = 1; seed <= deals; seed++) {
      const { hands } = drawOut(seed);
      points += highCardPoints(hands[0]!);
    }

    expect(points / deals).toBeGreaterThan(12);
  });
});
