import {
  applyAction,
  applyDealScore,
  createRng,
  newRubber,
  opponentOf,
  startDeal,
  totalScore,
  vulnerability,
} from "@hb/engine";
import type { DealScore, DealState, PlayerId } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { createRandomBot } from "../src/bot/randomBot.js";
import { botActionFor } from "../src/game/botTurn.js";
import { dealScoreFor, recordFor } from "../src/game/useGameSession.js";

/** A made contract worth `below` below the line, which is all the scorepad needs here. */
function madeFor(player: PlayerId, below: number): DealScore {
  const belowLine: [number, number] = [0, 0];
  belowLine[player] = below;

  return {
    aboveLine: [0, 0],
    belowLine,
    detail: {
      contractTricks: below,
      honors: [0, 0],
      insult: 0,
      made: true,
      overtricks: 0,
      slamBonus: 0,
      undertricks: 0,
    },
  };
}

function playDeal(seed: number, starter: PlayerId): DealState {
  const bot = createRandomBot(createRng(seed));
  let state = startDeal({ seed, starter });
  while (state.phase !== "complete") {
    state = applyAction(state, state.toAct, botActionFor(bot, state, state.toAct));
  }
  return state;
}

describe("scoring a deal into a rubber", () => {
  it("has nothing to score until the deal is complete", () => {
    const state = startDeal({ seed: 3, starter: 0 });

    expect(state.phase).toBe("draw");
    expect(dealScoreFor(state, [false, false])).toBeNull();
  });

  it("has nothing to score for a deal that was passed out", () => {
    let state = startDeal({ seed: 3, starter: 0 });
    while (state.phase === "draw") {
      state = applyAction(state, state.toAct, { type: "draw-decide", keep: true });
    }
    state = applyAction(state, state.toAct, { type: "call", call: { type: "pass" } });
    state = applyAction(state, state.toAct, { type: "call", call: { type: "pass" } });

    expect(state.passedOut).toBe(true);
    expect(dealScoreFor(state, [false, false])).toBeNull();
  });

  it("scores the same deal differently once a side is vulnerable", () => {
    // Same deal, same contract, same tricks — only the vulnerability differs,
    // which is exactly what carrying a rubber forward changes.
    const state = playDeal(2024, 0);
    if (state.passedOut) {
      throw new Error("Expected a contract for this seed");
    }

    const flat = dealScoreFor(state, [false, false])!;
    const both = dealScoreFor(state, [true, true])!;

    expect(flat.belowLine).toEqual(both.belowLine);
    // Vulnerability never touches the contract itself, only what rides above
    // the line: bigger penalties, bigger slams, dearer doubled overtricks.
    if (!flat.detail.made || flat.detail.overtricks > 0 || flat.detail.slamBonus > 0) {
      expect(both.aboveLine).not.toEqual(flat.aboveLine);
    }
  });

  it("marks the deal that wins a game, and only that deal", () => {
    const deal = playDeal(2024, 0);

    const start = newRubber();
    const partScore = madeFor(0, 60);
    const afterPart = applyDealScore(start, partScore);
    expect(recordFor(deal, partScore, start, afterPart).wonGameBy).toBeNull();

    // 60 already sits below the line, so another 60 carries past 100.
    const closing = madeFor(0, 60);
    const afterGame = applyDealScore(afterPart, closing);
    expect(afterGame.gamesWon).toEqual([1, 0]);
    expect(recordFor(deal, closing, afterPart, afterGame).wonGameBy).toBe(0);
  });

  it("marks a game won by either side", () => {
    const deal = playDeal(2024, 0);
    const start = newRubber();
    const score = madeFor(1, 120);

    expect(recordFor(deal, score, start, applyDealScore(start, score)).wonGameBy).toBe(1);
  });

  it("records a passed-out deal with no contract and nothing scored", () => {
    let state = startDeal({ seed: 3, starter: 0 });
    while (state.phase === "draw") {
      state = applyAction(state, state.toAct, { type: "draw-decide", keep: true });
    }
    state = applyAction(state, state.toAct, { type: "call", call: { type: "pass" } });
    state = applyAction(state, state.toAct, { type: "call", call: { type: "pass" } });

    const rubber = newRubber();
    const record = recordFor(state, null, rubber, rubber);

    expect(record.contract).toBeNull();
    expect(record.score).toBeNull();
    expect(record.wonGameBy).toBeNull();
  });

  it("carries part-scores and vulnerability from one deal to the next", () => {
    let rubber = newRubber();
    let starter: PlayerId = 0;

    for (let deal = 0; deal < 40 && !rubber.complete; deal++) {
      // The deal must be scored against the rubber as it stood when it began.
      const vulnerable = vulnerability(rubber);
      expect(vulnerable).toEqual([rubber.gamesWon[0] >= 1, rubber.gamesWon[1] >= 1]);

      const state = playDeal(7000 + deal, starter);
      const score = dealScoreFor(state, vulnerable);
      if (score !== null) {
        rubber = applyDealScore(rubber, score);
      }

      // A part-score never reaches a game without one being awarded for it.
      expect(rubber.partScore[0]).toBeLessThan(100);
      expect(rubber.partScore[1]).toBeLessThan(100);
      expect(totalScore(rubber)[0]).toBeGreaterThanOrEqual(0);

      starter = state.passedOut ? starter : opponentOf(starter);
    }
  });
});
