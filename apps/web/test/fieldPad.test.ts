// @vitest-environment jsdom
import { startDeal, summarizeField } from "@hb/engine";
import type { Card, FieldEntry, FieldResult, FieldState, Pair, PlayerId } from "@hb/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BoardReview, BoardReviews } from "../src/game/boardReview.js";
import { FieldPad } from "../src/ui/FieldPad.js";
import { stubBrowser } from "./support/board.js";

/**
 * The session pad, which is a row a board opening into its traveller.
 *
 * The summary goes through `summarizeField` rather than being written out whole, so a
 * figure this pad draws cannot quietly stop matching what the engine computes — the
 * results themselves are constructed, since what is under test is the screen.
 */

const ME: PlayerId = 0;

function entry(points: number, who: string, kind: FieldEntry["kind"] = "computer"): FieldEntry {
  return {
    contract: { declarer: 0, doubling: "none", level: 3, strain: "H" },
    kind,
    points,
    tricks: [9, 4],
    who,
  };
}

/**
 * A board this seat declared 4♠ on and made exactly.
 *
 * Its figures are left for the caller to set, because what several tests below turn
 * on is the gap between the score recorded and the score that contract pays — which
 * is the whole of how honors are recovered.
 */
function result(
  id: string,
  mine: number,
  field: readonly FieldEntry[] | null,
  vulnerable: Pair<boolean> = [false, false],
): FieldResult {
  return {
    board: { ids: [id, null], seed: 1, starter: 0, vulnerable },
    contract: { declarer: 0, doubling: "none", level: 4, strain: "S" },
    field: [field, null],
    points: [mine, 0],
    tricks: [10, 3],
  };
}

/** Thirteen distinct cards, for a review that only has to be the right shape. */
function thirteen(suit: Card["suit"]): readonly Card[] {
  return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((rank) => ({ rank, suit }) as Card);
}

const REVIEW: BoardReview = {
  auction: [{ by: 0, call: { type: "bid", bid: { level: 4, strain: "S" } } }],
  hands: [thirteen("S"), thirteen("H")],
  tricks: [10, 3],
};

function pad(results: readonly FieldResult[], kept?: BoardReviews): void {
  const state: FieldState = {
    at: results.length,
    boards: results.map((one) => one.board),
    deal: startDeal({ seed: 1, starter: 0 }),
    results,
  };
  render(
    createElement(FieldPad, {
      me: ME,
      opponentName: "Computer",
      reviews: { kept: kept ?? new Map(), open: opened },
      summary: summarizeField(state, ME),
    }),
  );
}

// A review draws real hands, and a row of cards measures itself — see `useRowRoom`.
beforeAll(stubBrowser);

/** Which board the pad last asked to have opened — the panel itself is `GameBoard`'s. */
let opened: (at: number) => void;
let asked: number[];

beforeEach(() => {
  asked = [];
  opened = (at) => {
    asked.push(at);
  };
});

afterEach(cleanup);

describe("the session pad", () => {
  const BOARDS = [
    result("b1", 620, [entry(170, "Computer"), entry(100, "Computer")]),
    result("b2", -100, [entry(140, "Noah", "solo")]),
  ];

  it("is one row a board, and nobody else's result is in the list", () => {
    pad(BOARDS);

    expect(screen.getByRole("button", { name: /Board 1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Board 2/ })).toBeTruthy();
    // The traveller belongs to the board's own panel — see `BoardReview`.
    expect(screen.queryByText("Noah")).toBeNull();
  });

  /**
   * **One way in, not two.** The list used to expand a traveller in place and hide
   * the hands behind a further button inside it, which lost your place in the list
   * on the way back. A row asks for the board and nothing expands.
   */
  it("drills a row straight into its board", () => {
    pad(BOARDS);
    fireEvent.click(screen.getByRole("button", { name: /Board 2/ }));

    expect(asked).toEqual([1]);
    expect(screen.queryByText("Noah")).toBeNull();
  });

  /**
   * The reveal between deals is about the hand that just finished, so it draws that
   * traveller outright — there is nothing to choose between and nothing to open.
   */
  it("draws the last board's traveller outright between deals", () => {
    const state: FieldState = {
      at: BOARDS.length,
      boards: BOARDS.map((one) => one.board),
      deal: startDeal({ seed: 1, starter: 0 }),
        results: BOARDS,
    };
    render(
      createElement(FieldPad, {
        latest: true,
        me: ME,
        opponentName: "Computer",
        reviews: { kept: new Map(), open: opened },
        summary: summarizeField(state, ME),
      }),
    );

    expect(screen.getByText("Noah")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Board 1/ })).toBeNull();
  });
});

/**
 * **Why a figure is the size it is, when the contract alone cannot say it.** A
 * traveller's rows are the same deal at four figures — 420, 620, 720 — and nothing
 * on them used to account for the differences.
 */
describe("what a contract is tagged with", () => {
  // 4♠ made exactly pays 120 below the line and a game bonus: 300 at neither
  // vulnerable, 500 vulnerable. Everything above that has to be honors.
  const PLAIN = 420;
  const VULNERABLE = 620;

  it("says when the contract was played vulnerable", () => {
    pad([result("b1", VULNERABLE, [], [true, false])]);

    expect(screen.getAllByText("vul").length).toBeGreaterThan(0);
  });

  /**
   * **Both halves, because the pair is what teaches itself.** A lone `def` is only
   * legible to somebody who already knows that its absence means the other thing.
   */
  it("says whether this seat declared the contract or defended it", () => {
    pad([result("b1", PLAIN, [])]);
    expect(screen.getByText("bid")).toBeTruthy();
    expect(screen.queryByText("def")).toBeNull();

    cleanup();
    pad([
      {
        ...result("b1", -50, []),
        contract: { declarer: 1, doubling: "none", level: 2, strain: "H" },
      },
    ]);
    expect(screen.getByText("def")).toBeTruthy();
    expect(screen.queryByText("bid")).toBeNull();
  });

  /**
   * The anti-vacuity half: without it a pad that tagged every contract would pass
   * the test above, and the tag would say nothing at all.
   */
  it("says nothing about vulnerability when neither side was", () => {
    pad([result("b1", PLAIN, [])]);

    expect(screen.queryByText("vul")).toBeNull();
  });

  /**
   * Honors are the one component of a score the contract cannot explain: they go to
   * whoever *holds* them, so a figure can be surprising with nothing beside it to
   * account for the surprise.
   */
  it("names honors, with the figure, where the score needs them to add up", () => {
    pad([result("b1", VULNERABLE + 100, [], [true, false])]);

    expect(screen.getAllByText("h+100").length).toBeGreaterThan(0);
  });

  it("says nothing about honors when the contract already accounts for the score", () => {
    pad([result("b1", VULNERABLE, [], [true, false])]);

    expect(screen.queryByText(/^h[+−]/)).toBeNull();
  });

  /**
   * Signed the way the points beside it are, because the other side holding them is
   * exactly the case that makes a row baffling.
   */
  it("signs honors toward the side that was paid", () => {
    // 4♠ made exactly pays 120 and a 300 game bonus at neither vulnerable, so a
    // recorded 320 is that less the hundred the other side took.
    pad([result("b1", PLAIN - 100, [])]);

    expect(screen.getByText("h−100")).toBeTruthy();
  });
});

/**
 * Going back to the hands of a board already played — the placing says how it went
 * and nothing about why, and the why is what was held and what was bid.
 */
describe("looking back at a board", () => {
  /**
   * **Between deals the board is drawn rather than listed**, and it is the same
   * component the pad opens — a traveller with a "Hands and bidding" button under it
   * made the board you had just played the one board reached differently from every
   * other, and that button opened a panel starting on the field anyway.
   */
  it("draws the board itself between deals, with the deal a tab away", () => {
    const boards = [result("b1", 420, [])];
    const state: FieldState = {
      at: boards.length,
      boards: boards.map((one) => one.board),
      deal: startDeal({ seed: 1, starter: 0 }),
      results: boards,
    };
    render(
      createElement(FieldPad, {
        latest: true,
        me: ME,
        opponentName: "Computer",
        reviews: { kept: new Map([["b1", REVIEW]]), open: opened },
        summary: summarizeField(state, ME),
      }),
    );

    expect(screen.getByRole("button", { name: "The field" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "The deal" })).toBeTruthy();
    // The traveller outright, not behind a tap.
    expect(screen.getByText("you")).toBeTruthy();
  });
});
