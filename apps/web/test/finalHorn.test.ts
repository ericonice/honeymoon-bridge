// @vitest-environment jsdom
import { legalActionsForView, newRubber } from "@hb/engine";
import type { PlayerId, RubberState } from "@hb/engine";
import { snapshotFor } from "@hb/protocol";
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { playRubberWon } from "../src/game/soundEffects.js";
import { board, renderBoard, settle, stubBrowser } from "./support/board.js";

vi.mock("../src/game/soundEffects.js", () => ({
  playCall: vi.fn(),
  playCardPlayed: vi.fn(),
  playDealOutcome: vi.fn(),
  playDrawResolve: vi.fn(),
  playRubberWon: vi.fn(),
}));

/**
 * A one-game match with both sides ten points short of it, so any made contract
 * at all finishes it — which puts the final score on screen without playing a
 * whole rubber to get there.
 */
function nearlyWon(): RubberState {
  return {
    ...newRubber("game"),
    belowLineTotal: [90, 90],
    partScore: [90, 90],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(playRubberWon).mockClear();
  stubBrowser();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Plays the deal out, taps on to the final score, and says whether it arrived. */
function playToTheEnd(seat: PlayerId, seed: number): boolean {
  renderBoard({ rubberBefore: nearlyWon(), seat, seed, sound: true });
  settle(4000);

  for (let step = 0; step < 200; step += 1) {
    const state = board.state;
    if (state.deal.phase === "complete") {
      break;
    }
    const actor = state.deal.toAct;
    const view = snapshotFor(state, actor).view;
    const legal = legalActionsForView(view).filter((action) => action.type !== "claim");
    const bidding = state.deal.phase === "auction";
    const action =
      bidding && view.auction.length === 0
        ? (legal.find((call) => call.type === "call" && call.call.type === "bid") ?? legal[0]!)
        : bidding
          ? (legal.find((call) => call.type === "call" && call.call.type === "pass") ?? legal[0]!)
          : legal[0]!;
    board.apply(actor, action);
    settle(4000);
  }

  // The last trick sweeps away, both hands are revealed, and a tap on the table
  // is what takes the board on to the final score — see `PlayPhase.handleTap`.
  const table = document.querySelector<HTMLElement>("main div");
  act(() => {
    table?.click();
  });
  settle(4000);

  return snapshotFor(board.state, seat).rubber.complete;
}

test("the horn for a won match sounds once, not once for every render that reached the score", () => {
  // Whether a contract is made depends on the deal and the point here is when
  // the horn sounds, so this takes the first seed whose contract makes — which
  // is what finishes the match.
  let finished = false;
  for (let seed = 1; seed <= 60 && !finished; seed += 1) {
    cleanup();
    vi.mocked(playRubberWon).mockClear();
    finished = playToTheEnd(0, seed);
  }

  expect(finished, "no seed in range finished the match").toBe(true);
  expect(vi.mocked(playRubberWon)).toHaveBeenCalledTimes(1);
});
