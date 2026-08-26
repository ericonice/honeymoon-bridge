import { applyAction, cardId, createRng, playableFrom, startDeal } from "@hb/engine";
import type { Card, DealState, PlayerId, PlayerView, Rank, Suit } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { sampleOpponentHand, shownVoids } from "../src/bot/sample.js";
import { createSamplingBot } from "../src/bot/samplingBot.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

function hand(spec: string): Card[] {
  const ranks: Record<string, Rank> = {
    A: 14, K: 13, Q: 12, J: 11, T: 10,
    "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
  };
  return spec.split(" ").flatMap((group) => {
    const [suit, cards] = group.split(":") as [Suit, string];
    return [...cards].map((rank) => ({ rank: ranks[rank]!, suit }));
  });
}

function viewWith(overrides: Partial<PlayerView>): PlayerView {
  return {
    auction: [],
    claim: null,
    completedTricks: [],
    contract: { declarer: 0, doubling: "none", level: 3, strain: "NT" },
    currentTrick: [],
    drawTurns: [],
    hand: [],
    handSizes: [13, 13],
    me: 0,
    opponent: 1,
    passedOut: false,
    pending: null,
    phase: "play",
    revealedHand: null,
    starter: 0,
    stockRemaining: 0,
    toAct: 0,
    trickLeader: 0,
    tricksWon: [0, 0],
    ...overrides,
  };
}

const SPADE_LEAD_RUFFED = viewWith({
  completedTricks: [
    {
      cards: [
        { by: 0, card: { rank: 14, suit: "S" } },
        { by: 1, card: { rank: 2, suit: "H" } },
      ],
      leader: 0,
      winner: 0,
    },
  ],
  hand: hand("S:KQ H:AK D:AK C:AK"),
  handSizes: [8, 8],
});

describe("what a seat can infer about the other hand", () => {
  it("reads a suit the opponent did not follow to as a void", () => {
    expect([...shownVoids(SPADE_LEAD_RUFFED)]).toEqual(["S"]);
  });

  it("reads nothing into a suit the opponent has followed", () => {
    const followed = viewWith({
      completedTricks: [
        {
          cards: [
            { by: 0, card: { rank: 14, suit: "S" } },
            { by: 1, card: { rank: 2, suit: "S" } },
          ],
          leader: 0,
          winner: 0,
        },
      ],
    });
    expect([...shownVoids(followed)]).toEqual([]);
  });
});

describe("guessing the opponent's hand", () => {
  const rng = createRng(99);

  it("deals them exactly the cards they are holding", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(sampleOpponentHand(SPADE_LEAD_RUFFED, rng)).toHaveLength(8);
    }
  });

  it("never gives them a card this seat can already place", () => {
    const placed = new Set([
      ...SPADE_LEAD_RUFFED.hand.map(cardId),
      "AS",
      "2H",
    ]);
    for (let attempt = 0; attempt < 20; attempt++) {
      for (const card of sampleOpponentHand(SPADE_LEAD_RUFFED, rng)) {
        expect(placed.has(cardId(card))).toBe(false);
      }
    }
  });

  it("never gives them a card in a suit they have shown out of", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      for (const card of sampleOpponentHand(SPADE_LEAD_RUFFED, rng)) {
        expect(card.suit).not.toBe("S");
      }
    }
  });

  // A weighted draw is easy to get subtly wrong in ways that only show as a
  // slightly worse bot, so the constraints are asserted with an auction present
  // as well as without: a lean toward one suit must not become a licence to
  // hand over cards this seat can already place, or to deal the wrong number.
  it("still respects everything it knows when the auction leans it somewhere", () => {
    const afterHearts = viewWith({
      ...SPADE_LEAD_RUFFED,
      auction: [{ by: 1, call: { type: "bid", bid: { level: 1, strain: "H" } } }],
    });
    const placed = new Set([...afterHearts.hand.map(cardId), "AS", "2H"]);

    for (let attempt = 0; attempt < 20; attempt++) {
      const sampled = sampleOpponentHand(afterHearts, rng);
      expect(sampled).toHaveLength(8);
      expect(new Set(sampled.map(cardId)).size).toBe(8);
      for (const card of sampled) {
        expect(placed.has(cardId(card))).toBe(false);
        expect(card.suit).not.toBe("S");
      }
    }
  });
});

describe("the sampling bot", () => {
  function playDeal(seed: number, starter: PlayerId): DealState {
    const bot = createSamplingBot(createRng(seed), 3);
    let state = startDeal({ seed, starter });
    while (state.phase !== "complete") {
      const action = botActionFor({ bot, seat: state.toAct, standing: loveAll(), state });
      if (action.type === "play") {
        const legal = playableFrom(state.hands[state.toAct], state.currentTrick);
        expect(legal.map(cardId)).toContain(cardId(action.card));
      }
      state = applyAction(state, state.toAct, action);
    }
    return state;
  }

  it("plays a legal card at every turn of a deal", () => {
    for (let seed = 1; seed <= 3; seed++) {
      const state = playDeal(seed, (seed % 2) as PlayerId);
      expect(state.completedTricks.length + (state.passedOut ? 13 : 0)).toBe(13);
    }
  });
});
