import { beats, buildDeck, createRng, opponentOf, playableFrom, shuffle, trumpSuit } from "@hb/engine";
import type { Card, Pair, PlayedCard, PlayerId, Rank, Strain, Suit } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { solve, tricksAfter } from "../src/bot/solver.js";

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

/**
 * The same question asked the slow way: plain minimax over card arrays, with no
 * pruning, no cache and no collapsing of equivalent cards. It is far too slow
 * for a real deal, which is the entire reason the real solver exists — but on
 * five cards it is fast enough to be the thing that says the fast one is right.
 */
function bruteForce(hands: Pair<readonly Card[]>, leader: PlayerId, strain: Strain): number {
  const trump = trumpSuit(strain);

  function play(
    current: Pair<readonly Card[]>,
    trickLeader: PlayerId,
    trick: readonly PlayedCard[],
  ): number {
    if (current[0].length === 0 && trick.length === 0) {
      return 0;
    }

    const toMove = trick.length === 0 ? trickLeader : opponentOf(trickLeader);
    let best: number | null = null;

    for (const card of playableFrom(current[toMove], trick)) {
      const next: Pair<readonly Card[]> = [current[0], current[1]];
      next[toMove] = current[toMove].filter(
        (held) => held.rank !== card.rank || held.suit !== card.suit,
      );

      const led = trick[0];
      let value: number;
      if (led === undefined) {
        value = play(next, trickLeader, [{ by: toMove, card }]);
      } else {
        const winner = beats(card, led.card, led.card.suit, trump) ? toMove : trickLeader;
        value = (winner === 0 ? 1 : 0) + play(next, winner, []);
      }

      if (best === null) {
        best = value;
      } else {
        best = toMove === 0 ? Math.max(best, value) : Math.min(best, value);
      }
    }

    return best ?? 0;
  }

  return play(hands, leader, []);
}

function dealHands(seed: number, size: number): Pair<readonly Card[]> {
  const deck = shuffle(buildDeck(), createRng(seed));
  return [deck.slice(0, size), deck.slice(size, size * 2)];
}

const STRAINS: readonly Strain[] = ["C", "D", "H", "S", "NT"];

describe("the double-dummy solver", () => {
  it("gives the trick to the higher card", () => {
    const result = solve({
      hands: [hand("S:A"), hand("S:K")],
      leader: 0,
      strain: "NT",
      trick: [],
    });
    expect(result.tricks).toEqual([1, 0]);
  });

  it("gives the trick to a ruff", () => {
    const result = solve({
      hands: [hand("S:A"), hand("H:2")],
      leader: 0,
      strain: "H",
      trick: [],
    });
    expect(result.tricks).toEqual([0, 1]);
  });

  it("splits a suit the two hands hold alternately, whoever leads", () => {
    for (const leader of [0, 1] as const) {
      const result = solve({
        hands: [hand("S:A2"), hand("S:K3")],
        leader,
        strain: "NT",
        trick: [],
      });
      expect(result.tricks).toEqual([1, 1]);
    }
  });

  it("counts a long trump suit as the tricks it actually wins", () => {
    // Five trumps against none: every trump wins, and the void hand's two
    // outside winners never get in, because it never gets the lead.
    const result = solve({
      hands: [hand("S:AKQJT"), hand("H:AK D:AKQ")],
      leader: 0,
      strain: "S",
      trick: [],
    });
    expect(result.tricks).toEqual([5, 0]);
  });

  it("answers a position with the lead already on the table", () => {
    const result = solve({
      hands: [hand("S:A"), hand("S:K")],
      leader: 0,
      strain: "NT",
      trick: [{ by: 0, card: { rank: 14, suit: "S" } }],
    });
    expect(result.tricks).toEqual([1, 0]);
    expect(result.card).toEqual({ rank: 13, suit: "S" });
  });

  it("agrees with an exhaustive search over random five-card positions", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const hands = dealHands(seed, 5);
      for (const strain of STRAINS) {
        for (const leader of [0, 1] as const) {
          const position = { hands, leader, strain, trick: [] };
          expect(solve(position).tricks[0]).toBe(bruteForce(hands, leader, strain));
        }
      }
    }
  });

  it("returns a card that really does achieve what it claims", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const hands = dealHands(seed, 6);
      for (const strain of STRAINS) {
        const position = { hands, leader: 0 as PlayerId, strain, trick: [] };
        const best = solve(position);
        expect(tricksAfter(position, best.card)).toEqual(best.tricks);
      }
    }
  });

  it("never rates any other card above the one it chose", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const hands = dealHands(seed, 6);
      const position = { hands, leader: 0 as PlayerId, strain: "NT" as Strain, trick: [] };
      const best = solve(position).tricks[0];
      for (const card of hands[0]) {
        expect(tricksAfter(position, card)[0]).toBeLessThanOrEqual(best);
      }
    }
  });
});
