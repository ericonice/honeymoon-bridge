import { applyAction, createRng, legalActionsForView, startDeal, viewFor } from "@hb/engine";
import type { Card, DealState, PlayerId } from "@hb/engine";
import { describe, expect, test } from "vitest";
import { botForLevel } from "../src/bot/build.js";
import type { DifficultyLevel } from "../src/bot/difficulty.js";
import { createSamplingBot } from "../src/bot/samplingBot.js";
import type { Bot } from "../src/bot/types.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/**
 * Zero samples is not a quieter sampler, it is a different and broken bot.
 *
 * Nothing separates the cards when no hand has been guessed, so the tie-break
 * decides everything and it plays its lowest legal card — every trick, every
 * deal. `bench/rubber.ts` had always branched around this and the app had not,
 * which meant a rung written with `samples: 0` would have *measured* as a sane
 * weak opponent and *shipped* as one that never plays a picture card by choice.
 *
 * The reason this needs a test rather than a comment: the branch is one line in
 * one factory, and the type happily allows a rung with no samples in it. The
 * failure is silent in both directions — no error, no warning, just a bot that
 * has stopped choosing.
 */

const NO_SOLVER: DifficultyLevel = { bidding: "priced", recall: 0, samples: 0, tuning: {} };

/** How often a bot picks the smallest card it is allowed to play, over one deal. */
function lowestCardRate(bot: Bot, seed: number): { readonly lowest: number; readonly played: number } {
  let state: DealState = startDeal({ seed, starter: 0 });
  let lowest = 0;
  let played = 0;

  while (state.phase !== "complete") {
    const seat: PlayerId = state.toAct;
    const action = botActionFor({ bot, seat, standing: loveAll(), state });
    if (state.phase === "play" && action.type === "play") {
      const view = viewFor(state, seat);
      const legal = legalActionsForView(view).flatMap((one) =>
        one.type === "play" ? [one.card] : [],
      );
      if (legal.length > 1) {
        played += 1;
        const smallest = legal.reduce((best: Card, card) => (card.rank < best.rank ? card : best));
        if (action.card.rank === smallest.rank && action.card.suit === smallest.suit) {
          lowest += 1;
        }
      }
    }
    state = applyAction(state, seat, action);
  }
  return { lowest, played };
}

describe("the computer assembled from a rung", () => {
  test("plays by rules of thumb when the rung asks for no sampling", () => {
    // Not "plays well" — plays like something that is still choosing. A deal has
    // plenty of tricks where the cheapest card is genuinely right, so the claim
    // is only that it is not *always* the cheapest one.
    const { lowest, played } = lowestCardRate(
      botForLevel({ level: NO_SOLVER, rng: createRng(7), tuning: {} }),
      41,
    );
    expect(played).toBeGreaterThan(4);
    expect(lowest).toBeLessThan(played);
  });

  /**
   * The other half, and what stops the test above passing for the wrong reason.
   * If the sampler ever learns to cope with zero samples on its own, this fails
   * and the branch in `botForLevel` can go — which is the only circumstance in
   * which removing it would be safe.
   */
  test("the sampler with nothing to sample on plays its lowest card every time", () => {
    const { lowest, played } = lowestCardRate(createSamplingBot(createRng(7), 0, {}), 41);
    expect(played).toBeGreaterThan(4);
    expect(lowest).toBe(played);
  });
});

describe("which question the bidder asks", () => {
  /**
   * The simple bidder replaces `chooseCall` and passes everything else through,
   * so the check is that the auction changes and the cards do not. Driven over a
   * whole deal rather than asserted against a type, because the wiring that could
   * break — which wrapper goes outside which — is not visible in the types at
   * all: wrapping the other way round would compile and would throw the card play
   * away.
   */
  function callsAndCards(bidding: "priced" | "simple"): {
    readonly calls: string[];
    readonly cards: string[];
  } {
    const level: DifficultyLevel = { bidding, recall: 13, samples: 0, tuning: {} };
    const bot = botForLevel({ level, rng: createRng(11), tuning: {} });
    let state: DealState = startDeal({ seed: 23, starter: 0 });
    const calls: string[] = [];
    const cards: string[] = [];
    while (state.phase !== "complete") {
      const seat: PlayerId = state.toAct;
      const action = botActionFor({ bot, seat, standing: loveAll(), state });
      if (action.type === "call") {
        calls.push(`${seat}:${JSON.stringify(action.call)}`);
      }
      if (action.type === "play") {
        cards.push(`${seat}:${action.card.rank}${action.card.suit}`);
      }
      state = applyAction(state, seat, action);
    }
    return { calls, cards };
  }

  test("bids differently from the priced bidder", () => {
    expect(callsAndCards("simple").calls).not.toEqual(callsAndCards("priced").calls);
  });

  test("still plays a full thirteen tricks a side", () => {
    expect(callsAndCards("simple").cards.length).toBe(26);
  });
});
