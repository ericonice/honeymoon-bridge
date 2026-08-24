import { applyAction, buildDeck, cardId, createRng, shuffle, startDeal, viewFor } from "@hb/engine";
import type { DealState, DrawChoice, PlayerId } from "@hb/engine";
import { describe, expect, test } from "vitest";
import { canSimulate, simulateDraw, theirChoices } from "../src/bot/drawSimulation.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/** A deal with the draw played out, so nothing has been led yet. */
function drawn(seed: number): DealState {
  const bots = [createHeuristicBot(createRng(seed + 1)), createHeuristicBot(createRng(seed + 2))];
  let state: DealState = startDeal({ seed, starter: 0 });
  while (state.phase === "draw") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat]!, seat, standing: loveAll(), state }));
  }
  return state;
}

describe("replaying the opponent's draw", () => {
  test("builds a hand of the right size from the pool it was given", () => {
    const pool = buildDeck().slice(0, 26);
    const turns: DrawChoice[] = Array.from({ length: 13 }, (_unused, index) =>
      index % 2 === 0 ? "kept-first" : "took-second",
    );
    const hand = simulateDraw({ pool, rng: createRng(5), turns });

    expect(hand).toHaveLength(13);
    const allowed = new Set(pool.map(cardId));
    for (const card of hand) {
      expect(allowed.has(cardId(card))).toBe(true);
    }
    // Thirteen distinct cards: a pool card must not be dealt twice.
    expect(new Set(hand.map(cardId)).size).toBe(13);
  });

  /**
   * The property that actually holds, and it is not the one I first asserted.
   *
   * A hand built by replaying a draw has the *shape* of a real one: over 300 deals
   * the longest suit averages 5.65 against a real 5.64, where the rank-weighted
   * draw it replaces gives 4.90 and half as many voids. That is what improved the
   * searched trick estimate, since tricks turn on distribution.
   *
   * **What does not hold: the choices barely matter.** Thirteen keeps against
   * thirteen sight-unseen takes come out at 15.70 and 15.81 points on shuffled
   * pools — indistinguishable. The reject branch forces the shown card to be one
   * the policy declines and then hands the *other* card over, which makes it
   * conditionally good where it should be random. The first version of this test
   * asserted a three-point gap and failed, which is how the flaw was found; the
   * earlier claim that this reproduced the keep-count spread was a confound, since
   * a pool rich in honours causes more keeps and any weighted draw tracks that.
   */
  test("builds hands with the distribution real hands have", () => {
    let longest = 0;
    let voids = 0;
    const rounds = 60;
    for (let seed = 1; seed <= rounds; seed++) {
      const pool = shuffle(buildDeck(), createRng(seed)).slice(0, 26);
      const turns: DrawChoice[] = Array.from({ length: 13 }, (_unused, index) =>
        index % 3 === 0 ? "kept-first" : "took-second",
      );
      const hand = simulateDraw({ pool, rng: createRng(seed * 31), turns });
      const counts = new Map<string, number>();
      for (const card of hand) {
        counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
      }
      longest += Math.max(...counts.values());
      voids += 4 - counts.size;
    }
    // Real hands average 5.64; a rank-weighted draw gives 4.90.
    expect(longest / rounds).toBeGreaterThan(5.2);
    expect(voids / rounds).toBeGreaterThan(0.04);
  });

  /**
   * It may only run where the draw can actually be replayed: each turn needs two
   * cards, so the pool has to be twice the hand. After the opponent has played,
   * it is not — and the simulation would also have to guarantee the cards they
   * have already shown end up in the hand, which it cannot.
   */
  test("only where there are two cards per turn", () => {
    const turns: DrawChoice[] = Array.from({ length: 13 }, () => "kept-first");
    expect(canSimulate(buildDeck().slice(0, 26), 13, turns)).toBe(true);
    expect(canSimulate(buildDeck().slice(0, 25), 13, turns)).toBe(false);
    expect(canSimulate(buildDeck().slice(0, 24), 12, turns)).toBe(false);
  });

  test("not when a card came off the open discard, which is known rather than guessed", () => {
    const turns: DrawChoice[] = [
      ...Array.from<unknown, DrawChoice>({ length: 12 }, () => "kept-first"),
      "took-discard",
    ];
    expect(canSimulate(buildDeck().slice(0, 26), 13, turns)).toBe(false);
  });

  test("the opponent's own choices are the ones read, in order", () => {
    const state = drawn(9);
    const view = viewFor(state, 0);
    const choices = theirChoices(view);
    expect(choices).toHaveLength(13);
    expect(choices).toEqual(
      state.drawTurns.filter((turn) => turn.by === 1).map((turn) => turn.choice),
    );
  });

  /** At a real auction position the guard should pass, which is what makes it useful. */
  test("applies at the first call of a real deal", () => {
    for (const seed of [3, 11, 24]) {
      const state = drawn(seed);
      const seat: PlayerId = state.toAct;
      const view = viewFor(state, seat);
      const pool = buildDeck().filter((card) => {
        const mine = new Set([...view.hand, ...state.discards[seat]].map(cardId));
        return !mine.has(cardId(card));
      });
      expect(canSimulate(pool, 13, theirChoices(view))).toBe(true);
    }
  });
});
