import { describe, expect, it } from "vitest";
import { shouldAcceptClaim } from "../src/bot/claimDecision.js";
import type { Card, Contract, DealState, Pair, PlayedCard, PlayerId, Rank, Suit } from "@hb/engine";

function hand(spec: string): Card[] {
  const ranks: Record<string, Rank> = {
    A: 14, K: 13, Q: 12, J: 11, T: 10,
    "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
  };
  if (spec === "") {
    return [];
  }
  return spec.split(" ").flatMap((group) => {
    const [suit, cards] = group.split(":") as [Suit, string];
    return [...cards].map((rank) => ({ rank: ranks[rank]!, suit }));
  });
}

function stateWith(overrides: {
  readonly claimant: PlayerId;
  readonly completedTricks: number;
  readonly currentTrick?: readonly PlayedCard[];
  readonly hands: Pair<readonly Card[]>;
  readonly trickLeader: PlayerId;
  readonly trump: Suit | "NT";
}): DealState {
  const contract: Contract = { declarer: 0, doubling: "none", level: 1, strain: overrides.trump };
  return {
    auction: [],
    claim: overrides.claimant,
    completedTricks: Array.from({ length: overrides.completedTricks }, () => ({
      cards: [],
      leader: 0,
      winner: 0,
    })),
    contract,
    currentTrick: overrides.currentTrick ?? [],
    discards: [[], []],
    drawTurns: [],
    hands: overrides.hands,
    initialHands: overrides.hands,
    lastDraws: [null, null],
    passedOut: false,
    pending: null,
    phase: "play",
    revealed: overrides.claimant,
    starter: 0,
    stock: [],
    toAct: overrides.claimant === 0 ? 1 : 0,
    trickLeader: overrides.trickLeader,
    tricksWon: [0, 0],
  };
}

describe("the computer's claim decision", () => {
  it("accepts a claim that really is airtight", () => {
    const state = stateWith({
      claimant: 0,
      completedTricks: 11,
      hands: [hand("S:AK"), hand("H:23")],
      trickLeader: 0,
      trump: "S",
    });
    expect(shouldAcceptClaim(state)).toBe(true);
  });

  it("denies a claim the defender has an out against", () => {
    // Two hearts against a trump and a discard: the defender ruffs one heart
    // whichever trick they choose to do it on, so the claimant never gets both.
    const state = stateWith({
      claimant: 0,
      completedTricks: 11,
      hands: [hand("H:AK"), hand("S:2 D:3")],
      trickLeader: 0,
      trump: "S",
    });
    expect(shouldAcceptClaim(state)).toBe(false);
  });

  it("accepts a claim offered mid-trick, after following to a lead", () => {
    // The opponent already led the king; the claimant's only remaining card
    // is the ace of the same suit, which beats it regardless of what they do.
    const led: PlayedCard = { by: 1, card: { rank: 13, suit: "S" } };
    const state = stateWith({
      claimant: 0,
      completedTricks: 12,
      currentTrick: [led],
      hands: [hand("S:A"), hand("")],
      trickLeader: 1,
      trump: "NT",
    });
    expect(shouldAcceptClaim(state)).toBe(true);
  });

  it("throws when nothing is actually pending", () => {
    const state = stateWith({
      claimant: 0,
      completedTricks: 11,
      hands: [hand("S:AK"), hand("H:23")],
      trickLeader: 0,
      trump: "S",
    });
    expect(() => shouldAcceptClaim({ ...state, claim: null })).toThrow();
  });
});
