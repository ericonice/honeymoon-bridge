// @vitest-environment jsdom
import { legalActionsForView } from "@hb/engine";
import type { Contract, DealRecord, PlayerId, ScoreDetail } from "@hb/engine";
import { snapshotFor } from "@hb/protocol";
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { board, renderBoard, settle, stubBrowser } from "./support/board.js";

beforeEach(() => {
  vi.useFakeTimers();
  stubBrowser();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ME: PlayerId = 0;
const EARLIER_CONTRACT: Contract = { declarer: ME, doubling: "none", level: 2, strain: "H" };

/** One deal already on the scorepad before this rubber's current deal was dealt. */
function earlierDeal(): DealRecord {
  const detail: ScoreDetail = {
    contractTricks: 8,
    honors: [0, 0],
    insult: 0,
    made: true,
    overtricks: 0,
    slamBonus: 0,
    undertricks: 0,
  };
  return {
    contract: EARLIER_CONTRACT,
    score: { aboveLine: [0, 0], belowLine: [60, 0], detail },
    starter: ME,
    tricksWon: [8, 5],
    wonGameBy: null,
  };
}

/**
 * Drives the deal on the table through the auction and play, preferring a bid
 * over a pass so it reaches a real contract rather than being passed out — the
 * same driver `finalHorn.test.ts` uses.
 */
function driveToComplete(): void {
  for (let step = 0; step < 200; step += 1) {
    const state = board.state;
    if (state.deal.phase === "complete") {
      return;
    }
    const actor = state.deal.toAct;
    const view = snapshotFor({ kind: "rubber", table: state }, actor).view;
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
  throw new Error("deal did not finish");
}

/** A row of `Scorepad`'s own history — see its exact class in `Scorepad.tsx`'s `DealLine`. */
function scorepadRows(): NodeListOf<Element> {
  return document.querySelectorAll('[class="flex items-baseline justify-between gap-2 py-1"]');
}

/**
 * The reveal has two things to say and a tap moves from the first to the
 * second, rather than showing both at once: the just-played hand's own
 * breakdown, then — on a further tap — the rubber's own scorepad, which is
 * the same figure the "Score" button opens in an overlay the rest of the
 * time. Matched on `Scorepad`'s own row class rather than on the contract
 * text, since the deal just played could coincidentally bid the same
 * contract as the seeded one and make the assertion pass for the wrong
 * reason.
 */
test("a further tap on the reveal swaps the hand's own breakdown for the rubber's scorepad", () => {
  renderBoard({ played: [earlierDeal()], seat: ME, seed: 5 });
  driveToComplete();

  expect(board.state.deal.contract).not.toBeNull();

  // The last trick's own hold and sweep, then the reveal — showing the hand's
  // own breakdown first, with the scorepad nowhere in it yet.
  settle(8000);
  expect(document.body.textContent).toContain("Tap to continue");
  expect(scorepadRows()).toHaveLength(0);

  // A further tap swaps it for the scorepad, without leaving the reveal —
  // "Tap to continue" is still what a second tap does from here.
  const table = document.querySelector<HTMLElement>("main div");
  act(() => {
    table?.click();
  });
  expect(document.body.textContent).toContain("Tap to continue");
  expect(scorepadRows().length).toBeGreaterThan(0);
});

/**
 * **Both revealed hands make room for the scorepad rather than squeezing it.**
 * Neither the opponent's revealed thirteen in `PlayPhase` nor this seat's own
 * in `GameBoard`'s footer are still what the screen is about once a tap has
 * asked to see the match instead — showing both anyway is what narrowed the
 * pad down to a strip between them. Matched on `data-card-id`, which every
 * rendered card carries, so this counts real cards rather than trusting a
 * layout class to mean "empty".
 */
test("a further tap that shows the scorepad also clears both revealed hands away", () => {
  renderBoard({ played: [earlierDeal()], seat: ME, seed: 5 });
  driveToComplete();
  settle(8000);

  // Both hands revealed, thirteen cards apiece, before the second tap.
  expect(document.querySelectorAll("[data-card-id]")).toHaveLength(26);

  const table = document.querySelector<HTMLElement>("main div");
  act(() => {
    table?.click();
  });

  expect(document.querySelectorAll("[data-card-id]")).toHaveLength(0);
});

/**
 * **With the setting off, the reveal has only one thing to say, so one tap is
 * enough.** The scorepad never gets staged at all — it stays reachable
 * through the "Score" button, same as ever — and the tap that would otherwise
 * have shown it goes straight on to the next deal instead.
 */
test("with the match-score setting off, a single tap skips straight past the reveal", () => {
  renderBoard({ matchDetail: false, played: [earlierDeal()], seat: ME, seed: 5 });
  driveToComplete();
  settle(8000);

  expect(document.body.textContent).toContain("Tap to continue");
  expect(scorepadRows()).toHaveLength(0);

  const table = document.querySelector<HTMLElement>("main div");
  act(() => {
    table?.click();
  });
  settle(4000);

  expect(scorepadRows()).toHaveLength(0);
  // One tap was enough to move the table on to a new deal, rather than
  // waiting on a second tap that this setting never offers.
  expect(board.state.deal.phase).not.toBe("complete");
});
