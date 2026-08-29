// @vitest-environment jsdom
import { legalActionsForView } from "@hb/engine";
import type { DealAction, PlayerId } from "@hb/engine";
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

function buttonSaying(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((one) => one.textContent === text);
}

function viewOf(seat: PlayerId) {
  return snapshotFor({ kind: "rubber", table: board.state }, seat).view;
}

/**
 * Cards mid-flight: `CardFlight`'s own wrapper, which is the only thing on the board
 * that says a card is *travelling* rather than merely present. The trick slots draw a
 * played card the instant it is in state, so counting faces cannot tell a card that
 * flew in from one that was simply there — which is the whole distinction this is about.
 */
function inFlight(): number {
  return document.querySelectorAll(".pointer-events-none.absolute.top-0.left-0 .card-face").length;
}

/** Cards sitting in the trick slots, which draw at `table` size and nothing else does. */
function onTheTable(): number {
  return document.querySelectorAll(".card-face.h-24.w-16").length;
}

/**
 * Drives to a contract with `seat` declaring, so the board holds the closed auction for
 * it and the *other* seat is on lead — which is the only arrangement where their card
 * can arrive before this screen has been drawn.
 */
function toAContract(seat: PlayerId): void {
  renderBoard({ seat, seed: 7 });
  settle(4000);
  while (board.state.deal.phase === "draw") {
    board.apply(board.state.deal.toAct, { type: "draw-decide", take: "first" });
    settle(4000);
  }
  // The seat we are watching opens; the other passes. One pass closes the auction, so
  // the opener declares and the opponent leads.
  const opening = legalActionsForView(viewOf(seat)).find(
    (one): one is DealAction => one.type === "call" && one.call.type === "bid",
  );
  expect(opening, "no opening bid was available").toBeDefined();
  board.apply(seat, opening!);
  settle(4000);
  const them: PlayerId = seat === 0 ? 1 : 0;
  const pass = legalActionsForView(viewOf(them)).find(
    (one): one is DealAction => one.type === "call" && one.call.type === "pass",
  );
  board.apply(them, pass!);
  settle(4000);
}

test("their opening lead arrives while the closed auction is still being read", () => {
  const seat: PlayerId = 0;
  toAContract(seat);

  // The contract is held for a tap, which is what gives the other seat its opening.
  const start = buttonSaying("Start play");
  expect(start, "the closed auction was not held").toBeDefined();
  expect(board.state.deal.phase).toBe("play");

  // They lead, over the network, without waiting — which they are under no obligation
  // to do. Nothing on this screen has moved: the auction is still up.
  const them: PlayerId = seat === 0 ? 1 : 0;
  const lead = legalActionsForView(viewOf(them)).find(
    (one): one is DealAction => one.type === "play",
  );
  expect(lead, "the other seat was not on lead").toBeDefined();
  board.apply(them, lead!);
  settle(4000);
  expect(onTheTable(), "the play screen was drawn behind the held auction").toBe(0);

  // Now the contract is dismissed. Their card is already played, and it has to arrive
  // as a card being *played* rather than as one that was simply there.
  act(() => {
    start!.click();
  });
  expect(inFlight(), "their lead was already on the table rather than flying to it").toBe(1);

  settle(4000);
  expect(inFlight()).toBe(0);
  expect(onTheTable(), "their lead never landed").toBe(1);
});
