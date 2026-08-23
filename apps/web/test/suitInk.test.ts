// @vitest-environment jsdom
import { legalActionsForView } from "@hb/engine";
import { snapshotFor } from "@hb/protocol";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { board, renderBoard, settle, stubBrowser } from "./support/board.js";

const RED_SUIT = /[♥♦]/;
const ANY_SUIT = /[♠♥♦♣]/;

/** The two reds, one per ground — see `CardText`'s `RED`. */
const PRINTED_RED = "text-ink-red";
const TABLE_RED = "text-red-400";

/**
 * Whether a class names one of the app's light grounds: the cards' own paper
 * (`card-face`), the washed surface the game is written down on (`scorecard`),
 * an amber tile, a white button. Matched by hand rather than inferred, because
 * "is this light enough for printed ink" is a judgement about four specific
 * surfaces and not something a test can work out from a name.
 *
 * Both washes are named classes rather than utilities on purpose, so the one
 * number that tunes them lives in `index.css` and nothing here has to be kept
 * in step with it.
 */
function isPaper(name: string): boolean {
  return (
    name === "card-face" ||
    name === "scorecard" ||
    name === "bg-amber-400" ||
    name === "bg-white"
  );
}

/** The nearest of `classes` on this element or an ancestor, or null. */
function nearest(from: Element | null, classes: readonly string[]): string | null {
  for (let element = from; element !== null; element = element.parentElement) {
    const found = classes.find((candidate) => element!.classList.contains(candidate));
    if (found !== undefined) {
      return found;
    }
  }
  return null;
}

/** True when this element or an ancestor has one of `classes`. */
function has(from: Element | null, matches: (name: string) => boolean): boolean {
  for (let element = from; element !== null; element = element.parentElement) {
    if ([...element.classList].some(matches)) {
      return true;
    }
  }
  return false;
}

interface Glyph {
  /** On paper, so the printed inks apply rather than the table's. */
  readonly onPaper: boolean;
  /** Whichever red it was actually given, or null for a black suit. */
  readonly red: string | null;
  readonly text: string;
}

/**
 * Every suit symbol on screen, with the ground it stands on and the red it was
 * given — walked out of the rendered text rather than asked of any component, so
 * a new place that names a card is covered without anyone remembering this
 * exists. The same reason `packages/protocol/test/snapshot.test.ts` is blind.
 */
function glyphs(): Glyph[] {
  const found: Glyph[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    if (!ANY_SUIT.test(text)) {
      continue;
    }
    const element = node.parentElement;
    found.push({
      onPaper: has(element, isPaper),
      red: nearest(element, [PRINTED_RED, TABLE_RED]),
      text: text.trim(),
    });
  }
  return found;
}

beforeEach(() => {
  vi.useFakeTimers();
  stubBrowser();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Advances the deal by one action from whichever seat is on turn. */
function step(prefer: "bid" | "pass" | "any"): void {
  const state = board.state;
  const actor = state.deal.toAct;
  const view = snapshotFor(state, actor).view;
  const legal = legalActionsForView(view).filter((action) => action.type !== "claim");
  // A red bid on purpose: a printed red is the half of this that can be got
  // wrong quietly, and bidding clubs would walk straight past every one of them.
  const wanted =
    prefer === "bid"
      ? legal.find(
          (action) =>
            action.type === "call" &&
            action.call.type === "bid" &&
            (action.call.bid.strain === "D" || action.call.bid.strain === "H"),
        )
      : prefer === "pass"
        ? legal.find((action) => action.type === "call" && action.call.type === "pass")
        : undefined;
  board.apply(actor, wanted ?? legal[0]!);
  settle(4000);
}

/** Walks a deal, handing every screen it passes through to `check`. */
function throughADeal(check: (where: string) => void): void {
  renderBoard({ seat: 0, seed: 7 });
  settle(4000);
  check("the draw");

  while (board.state.deal.phase === "draw") {
    step("any");
  }
  step("bid");
  check("mid-auction");

  while (board.state.deal.phase === "auction") {
    step("pass");
  }
  check("the settled contract");

  while (board.state.deal.phase === "play") {
    step("any");
  }
  check("play");

  settle(4000);
  check("the finished deal");
}

test("a red suit takes the red of the ground it is set on, never the other one", () => {
  // The app has two reds on purpose — the printed one on paper, a lighter one
  // that lifts off felt — and swapping them is the failure that would go
  // unnoticed: both are red, so only a walk like this catches it.
  throughADeal((where) => {
    const reds = glyphs().filter((glyph) => RED_SUIT.test(glyph.text));
    // A walker that passes because it found nothing is worse than none: the hand
    // alone holds thirteen cards throughout.
    expect(reds.length, `no red suits on screen at ${where}`).toBeGreaterThan(0);
    for (const glyph of reds) {
      expect(glyph.red, `${glyph.text} at ${where}, on ${glyph.onPaper ? "paper" : "the table"}`).toBe(
        glyph.onPaper ? PRINTED_RED : TABLE_RED,
      );
    }
  });
});

/**
 * The auction's five strain tiles, found by what they say rather than by a hook
 * put there for the test: a button whose whole label is one suit or "NT" is one
 * of them and nothing else in the app is. The contract bar is the near miss that
 * makes this worth stating — it wraps a whole sentence in a button so a tap opens
 * the scorepad, so "a suit inside a button" catches prose too.
 */
function strainTiles(): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")].filter((button) =>
    /^(?:[♠♥♦♣]|NT)$/.test(button.textContent?.trim() ?? ""),
  );
}

test("the auction's strain tiles are printed on paper rather than rimmed", () => {
  // A tile you tap is an object and an object carries paper convincingly, so
  // these need no rim — and would look wrong with one, at that size.
  renderBoard({ seat: 0, seed: 7 });
  settle(4000);
  while (board.state.deal.phase === "draw") {
    step("any");
  }

  const tiles = strainTiles();
  expect(tiles.length, "the five strains").toBe(5);
  expect(
    tiles.filter((tile) => !has(tile, isPaper)).map((tile) => tile.textContent),
    "strain tiles set straight onto the table",
  ).toEqual([]);
});
