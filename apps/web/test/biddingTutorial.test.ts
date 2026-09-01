// @vitest-environment jsdom
import { scoreDeal } from "@hb/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { BiddingTutorialOverlay } from "../src/ui/BiddingTutorialOverlay.js";

/**
 * Same discipline as `scoringPage.test.ts`: the figures this screen prints are
 * checked against the engine directly, not against `biddingFacts.ts`, so a
 * fact and the test guarding it cannot silently agree with each other no
 * matter what either says.
 */

afterEach(cleanup);

function show(onClose = vi.fn()): ReturnType<typeof vi.fn> {
  render(createElement(BiddingTutorialOverlay, { onClose }));
  return onClose;
}

const text = (): string => (document.body.textContent ?? "").replace(/\s+/g, " ");

function table(caption: string): readonly (readonly string[])[] {
  const found = [...document.querySelectorAll("table")].find((one) =>
    (one.querySelector("caption")?.textContent ?? "").includes(caption),
  );
  if (found === undefined) {
    throw new Error(`no table captioned "${caption}"`);
  }
  return [...found.querySelectorAll("tbody tr")].map((row) =>
    [...row.querySelectorAll("th, td")].map((cell) => (cell.textContent ?? "").trim()),
  );
}

const next = (): void => {
  fireEvent.click(screen.getByText("Next"));
};

test("opens on the first step, twelve steps long", () => {
  show();
  expect(screen.getByText("Step 1 of 12")).toBeTruthy();
  expect(screen.getByText("What the bidding is deciding")).toBeTruthy();
});

test("Next moves forward one step at a time", () => {
  show();
  next();
  expect(screen.getByText("Step 2 of 12")).toBeTruthy();
  expect(screen.getByText("A bid is a promise, in tricks")).toBeTruthy();
});

test("the top Back button steps backward rather than leaving, except on the first step", () => {
  const onClose = show();
  next();
  next();
  expect(screen.getByText("Step 3 of 12")).toBeTruthy();

  fireEvent.click(screen.getByText("Back"));
  expect(screen.getByText("Step 2 of 12")).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText("Back"));
  expect(screen.getByText("Step 1 of 12")).toBeTruthy();

  // One more Back, from the first step, actually leaves.
  fireEvent.click(screen.getByText("Back"));
  expect(onClose).toHaveBeenCalledOnce();
});

test("the last step's button says Done and leaves when tapped", () => {
  const onClose = show();
  for (let i = 0; i < 11; i++) {
    next();
  }
  expect(screen.getByText("Step 12 of 12")).toBeTruthy();
  expect(screen.queryByText("Next")).toBeNull();

  fireEvent.click(screen.getByText("Done"));
  expect(onClose).toHaveBeenCalledOnce();
});

test("the trick-target table matches level plus six and eight minus the level", () => {
  show();
  next();
  next();
  const rows = table("What each side needs");

  expect(rows).toHaveLength(7);
  rows.forEach((row, index) => {
    const level = index + 1;
    expect(row).toEqual([String(level), String(level + 6), String(8 - level)]);
  });
});

/**
 * The tutorial's sharpest claim: making a doubled contract nets the same
 * whether declarer is vulnerable or not, and only going down moves — checked
 * against `scoreDeal` itself rather than `biddingFacts.ts`.
 */
test("the doubled 4H table matches what scoreDeal actually settles", () => {
  show();
  for (let i = 0; i < 9; i++) {
    next();
  }
  const rows = table("4 hearts, doubled");

  const netAt = (tricksWon: number, declarerVulnerable: boolean): number => {
    const score = scoreDeal(
      {
        contract: { declarer: 0, doubling: "doubled", level: 4, strain: "H" },
        hands: [[], []],
        tricksWon: [tricksWon, 13 - tricksWon],
      },
      [declarerVulnerable, false],
    );
    return score.belowLine[0] + score.aboveLine[0] - score.belowLine[1] - score.aboveLine[1];
  };

  expect(rows[0]).toEqual(["Made exactly", String(netAt(10, false)), String(netAt(10, true))]);
  expect(rows[1]).toEqual(["Down 1", String(netAt(9, false)), String(netAt(9, true))]);
  expect(rows[2]).toEqual(["Down 2", String(netAt(8, false)), String(netAt(8, true))]);
  expect(rows[3]).toEqual(["Down 3", String(netAt(7, false)), String(netAt(7, true))]);

  // The point of the table: made is the same either way, down is not.
  expect(netAt(10, false)).toBe(netAt(10, true));
  expect(netAt(9, true)).toBeLessThan(netAt(9, false));
});

test("names the four cheapest game bids without stating the arithmetic behind them", () => {
  show();
  for (let i = 0; i < 8; i++) {
    next();
  }
  const said = text();
  for (const bid of ["3NT", "4♥", "4♠", "5♣", "5♦"]) {
    expect(said, `${bid} missing from the game step`).toContain(bid);
  }
});
