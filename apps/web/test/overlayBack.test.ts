// @vitest-environment jsdom
import type { Card, FieldResult, PlayerId } from "@hb/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { BoardReview as Review } from "../src/game/boardReview.js";
import { BoardReview } from "../src/ui/BoardReview.js";
import { Overlay } from "../src/ui/Overlay.js";
import { stubBrowser } from "./support/board.js";

/**
 * The third thing a panel's corner can mean.
 *
 * A surface that fills the screen says Back; a panel over what you were doing gets a
 * ✕. A panel *pushed from within another panel* is neither: tapping a board in the
 * Score panel used to stack a second panel on the first, which is two dimmed grounds
 * and two ✕s with nothing saying which one a swipe dismisses.
 */

const ME: PlayerId = 0;

beforeAll(stubBrowser);
afterEach(cleanup);

function thirteen(suit: Card["suit"]): readonly Card[] {
  return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((rank) => ({ rank, suit }) as Card);
}

const REVIEW: Review = {
  auction: [{ by: 0, call: { type: "bid", bid: { level: 4, strain: "S" } } }],
  hands: [thirteen("S"), thirteen("H")],
  tricks: [10, 3],
};

const RESULT: FieldResult = {
  board: { ids: ["b1", null], seed: 1, starter: 0, vulnerable: [false, false] },
  contract: { declarer: 0, doubling: "none", level: 4, strain: "S" },
  field: [[], null],
  points: [420, 0],
  tricks: [10, 3],
};

describe("a panel's way out", () => {
  it("offers only a ✕ when there is nothing behind it but the game", () => {
    render(createElement(Overlay, { children: "body", onClose: () => {}, title: "Score" }));

    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  /**
   * Both, because they are different intentions: one step back to the pad this was
   * pushed from, and out of the sheet altogether.
   */
  it("offers a back chevron as well when it was pushed from another panel", () => {
    let backs = 0;
    let closes = 0;
    render(
      createElement(Overlay, {
        children: "body",
        onBack: () => {
          backs += 1;
        },
        onClose: () => {
          closes += 1;
        },
        title: "Board 1",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(backs).toBe(1);
    expect(closes).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(closes).toBe(1);
    expect(backs).toBe(1);
  });
});

describe("a board opened from the score pad", () => {
  function review(onBack: (() => void) | null): void {
    render(
      createElement(BoardReview, {
        at: 0,
        me: ME,
        onBack,
        onClose: () => {},
        opponentName: "Computer",
        result: RESULT,
        review: REVIEW,
      }),
    );
  }

  it("takes a back chevron where it was pushed from the pad", () => {
    review(() => {});

    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  /**
   * The anti-vacuity half. Opened over the board — from the reveal, or the screen
   * that ends a deal — there is no pad to go back to, and a chevron there would
   * promise a step that does not exist.
   */
  it("takes none where it was opened over the board", () => {
    review(null);

    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });
});
