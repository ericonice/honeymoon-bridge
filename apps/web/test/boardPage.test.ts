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
 * A board is a **page**, not a panel, and the two are different kinds of surface.
 *
 * `Overlay`'s rule: a panel is for looking something up with what you were doing
 * still behind it, and it gets a ✕. A traveller, twenty-six cards and an auction,
 * reached by drilling into a list, is not a glance — it is a destination, and a
 * phone answers that with a page you can swipe out of. It was a panel only because
 * it was pushed from one.
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

function page(onBack: () => void = () => {}): void {
  render(
    createElement(BoardReview, {
      at: 2,
      me: ME,
      onBack,
      opponentName: "Computer",
      result: RESULT,
      review: REVIEW,
    }),
  );
}

describe("a board's own page", () => {
  it("says Back in the corner an iPhone keeps it, and nothing else", () => {
    page();

    expect(screen.getByRole("button", { name: /Back/ })).toBeTruthy();
    // No ✕: a page has one way out, and there is only one way in.
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("goes back on the swipe that corner promises", () => {
    let backs = 0;
    page(() => {
      backs += 1;
    });

    // The end reads `changedTouches`, which is where a finger that has lifted is.
    fireEvent.touchStart(document, { touches: [{ clientX: 6, clientY: 300 }] });
    fireEvent.touchMove(document, { touches: [{ clientX: 120, clientY: 305 }] });
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 120, clientY: 305 }] });

    expect(backs).toBe(1);
  });

  /**
   * The anti-vacuity half: the gesture is deliberately narrow, the same restraint
   * iOS takes — a drag that starts away from the edge is an ordinary scroll.
   */
  it("ignores a drag that did not start at the edge", () => {
    let backs = 0;
    page(() => {
      backs += 1;
    });

    fireEvent.touchStart(document, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchMove(document, { touches: [{ clientX: 320, clientY: 305 }] });
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 320, clientY: 305 }] });

    expect(backs).toBe(0);
  });

  it("names the board it is showing", () => {
    page();

    expect(screen.getByRole("heading", { name: "Board 3" })).toBeTruthy();
  });
});

/**
 * And a panel is back to one way out, the chevron it briefly grew having been the
 * symptom of a surface that should not have been a panel at all.
 */
describe("a panel", () => {
  it("has a ✕ and no back chevron", () => {
    render(createElement(Overlay, { children: "body", onClose: () => {}, title: "Score" }));

    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });
});
