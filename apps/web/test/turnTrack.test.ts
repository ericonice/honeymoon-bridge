// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
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

/** Every dot on screen, over both seats' tracks. */
function allDots(): number {
  return document.querySelectorAll("span.h-1\\.5").length;
}

/** How many of them carry `fill`. */
function dots(fill: string): number {
  return document.querySelectorAll(`span.${fill.replace("/", "\\/")}`).length;
}

function playDraw(turns: number, take: "first" | "second"): void {
  renderBoard({ seat: 0, seed: 7 });
  settle(4000);
  for (let turn = 0; turn < turns; turn += 1) {
    board.apply(board.state.deal.toAct, { type: "draw-decide", take });
    settle(4000);
  }
}

test("both seats get a track of thirteen, and nothing is spent before the first turn", () => {
  renderBoard({ seat: 0, seed: 7 });
  settle(4000);

  // Thirteen each, less the one turn actually being decided — that dot is
  // amber, which is this screen's one way of saying "it's your move".
  expect(dots("border-white/40")).toBe(25);
  expect(dots("bg-sky-300")).toBe(0);
  expect(dots("bg-violet-400")).toBe(0);
});

test("a dot says which card the turn took, for either seat", () => {
  // Four turns: two apiece, since turns alternate. Keeping the face-up card and
  // taking the unseen one have to be told apart at a glance, which is the whole
  // reason the fill is a color rather than one more solid dot.
  playDraw(4, "first");
  expect(dots("bg-sky-300")).toBe(4);
  expect(dots("bg-violet-400")).toBe(0);

  cleanup();
  playDraw(4, "second");
  expect(dots("bg-violet-400")).toBe(4);
  expect(dots("bg-sky-300")).toBe(0);
});

test("the opponent's spent turns are on their own track, not folded into this seat's", () => {
  renderBoard({ seat: 0, seed: 7 });
  settle(4000);

  // One turn each way, taking a different card each time, so each track can only
  // account for its own — a single shared count could not tell these apart.
  board.apply(board.state.deal.toAct, { type: "draw-decide", take: "first" });
  settle(4000);
  board.apply(board.state.deal.toAct, { type: "draw-decide", take: "second" });
  settle(4000);

  expect(dots("bg-sky-300")).toBe(1);
  expect(dots("bg-violet-400")).toBe(1);
});
