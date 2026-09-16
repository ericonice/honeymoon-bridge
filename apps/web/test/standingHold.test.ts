// @vitest-environment jsdom
import { legalActionsForView, newRubber, viewFor } from "@hb/engine";
import type { PlayerId, RubberState } from "@hb/engine";
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { board, renderBoard, settle, stubBrowser } from "./support/board.js";

/**
 * The running score waits for the screen that explains it.
 *
 * A deal settles the instant its thirteenth card lands, so the strip's total moved
 * while the player was still looking at the trick — and in a Doop session a second
 * line appeared under the placing for the length of a field fetch and then went away.
 * Reported as jitter, which is what it was: the number changed before the reveal that
 * accounts for it.
 *
 * Driven through the real board rather than by calling the hook, because what is being
 * checked is *when a number reaches the screen*, and a hook test would assert the hold
 * against the same expression that implements it.
 */
function nearlyWon(): RubberState {
  return { ...newRubber("game"), belowLineTotal: [90, 90], partScore: [90, 90] };
}

beforeEach(() => {
  vi.useFakeTimers();
  stubBrowser();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * The strip alone, by the label it carries for a screen reader.
 *
 * The whole screen changes when the last card lands — the trick resolves, the hands
 * come up — so comparing `main` would say "something moved" and never which thing.
 */
function strip(): string {
  return document.querySelector('[aria-label="Show the score"]')?.textContent ?? "";
}

/**
 * The Total row's two figures, which is the thing being held.
 *
 * The whole strip is too broad: the contract label arrives on its own schedule and
 * would make this pass or fail for a reason that has nothing to do with the score.
 */
function total(): string {
  return /Total([\d–\-]+)/.exec(strip())?.[1] ?? "";
}

test("the strip holds the score until the hands are revealed", () => {
  const seat: PlayerId = 0;
  renderBoard({ rubberBefore: nearlyWon(), seat, seed: 7 });

  // Every action but the last card of the deal.
  let lastAction: { actor: PlayerId; action: unknown } | null = null;
  for (let step = 0; step < 4000; step += 1) {
    if (board.state.deal.phase === "complete") {
      break;
    }
    const actor = board.state.deal.toAct;
    const view = viewFor(board.state.deal, actor);
    const legal = legalActionsForView(view).filter((one) => one.type !== "claim");
    const bidding = board.state.deal.phase === "auction";
    const action =
      bidding && view.auction.length === 0
        ? (legal.find((one) => one.type === "call" && one.call.type === "bid") ?? legal[0]!)
        : bidding
          ? (legal.find((one) => one.type === "call" && one.call.type === "pass") ?? legal[0]!)
          : legal[0]!;
    // Hold back the very last card of the deal — the *second* of the thirteenth
    // trick — so the score as it stood a moment earlier can be read off the strip.
    if (
      board.state.deal.phase === "play" &&
      board.state.deal.completedTricks.length === 12 &&
      board.state.deal.currentTrick.length === 1
    ) {
      lastAction = { actor, action };
      break;
    }
    board.apply(actor, action);
    settle(4000);
  }

  expect(lastAction, "never reached the last card").not.toBeNull();
  const before = total();
  // Anti-vacuity: an empty match would make both comparisons below trivially true.
  expect(before).not.toBe("");

  act(() => {
    board.apply(lastAction!.actor, lastAction!.action as never);
  });

  // The deal is scored in the engine now — but the reveal has not landed, so the
  // strip must still be showing what it showed a moment ago.
  expect(board.state.deal.phase).toBe("complete");
  expect(total()).toBe(before);

  // Let the trick hold and the sweep run; the reveal lands and the score moves.
  settle(8000);
  expect(total()).not.toBe(before);
});
