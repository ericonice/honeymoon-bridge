import { applyAction, cardId, createRng, scoreDeal, startDeal, viewFor } from "@hb/engine";
import type { DealState, PlayerId } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { createRandomBot } from "../src/bot/randomBot.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/**
 * Drives both seats with random bots until the deal ends. Every action goes
 * through `botActionFor`, so the bot only ever sees its own `PlayerView` — the
 * same path the app uses for the computer opponent.
 */
function playDeal(seed: number, starter: PlayerId): DealState {
  const bot = createRandomBot(createRng(seed));
  let state = startDeal({ seed, starter });

  while (state.phase !== "complete") {
    state = applyAction(state, state.toAct, botActionFor({ bot, seat: state.toAct, standing: loveAll(), state }));
  }
  return state;
}

describe("a deal driven entirely by random bots", () => {
  it("runs draw, auction and play to completion without an illegal action", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const finished = playDeal(seed, seed % 2 === 0 ? 0 : 1);

      expect(finished.phase).toBe("complete");
      if (!finished.passedOut) {
        expect(finished.completedTricks).toHaveLength(13);
        expect(finished.tricksWon[0] + finished.tricksWon[1]).toBe(13);
      }
    }
  });

  it("always reaches a scorable result when the deal was not passed out", () => {
    let scored = 0;

    for (let seed = 500; seed < 560; seed++) {
      const finished = playDeal(seed, 0);
      if (finished.passedOut) {
        continue;
      }

      const score = scoreDeal(
        {
          contract: finished.contract!,
          hands: finished.initialHands!,
          tricksWon: finished.tricksWon,
        },
        [false, false],
      );

      // Exactly one side scores below the line, and only when the contract made.
      expect(score.belowLine[0] === 0 || score.belowLine[1] === 0).toBe(true);
      expect(score.detail.made).toBe(score.belowLine[finished.contract!.declarer] > 0);
      scored++;
    }

    expect(scored).toBeGreaterThan(0);
  });

  it("hands the bot a view that hides the opponent's cards and the stock", () => {
    const state = startDeal({ seed: 31, starter: 1 });
    const view = viewFor(state, 1);

    const exposed = new Set(view.hand.map(cardId));
    for (const card of state.hands[0]) {
      expect(exposed.has(cardId(card))).toBe(false);
    }
    expect(Object.keys(view)).not.toContain("stock");
    expect(Object.keys(view)).not.toContain("discards");
  });
});
