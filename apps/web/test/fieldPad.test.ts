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

  it("is one row a board until one is opened", () => {
    pad(BOARDS);

    expect(screen.getByRole("button", { name: /Board 1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Board 2/ })).toBeTruthy();
    // Nobody else's name is on screen while every board is shut.
    expect(screen.queryByText("Noah")).toBeNull();
  });

  /**
   * **Said, not implied.** It used to read "by them", which named a different person
   * on every row — and on somebody else's line it reads as *your* opponent rather
   * than theirs. A defender's row is the one that needs saying, because a defender of
   * a contract that made scores nothing and a bare zero explains itself to nobody.
   */
  it("says which rows were defending, on their own terms", () => {
    pad([
      result("b1", 620, [
        { ...entry(-100, "Noah", "solo"), contract: { declarer: 1, doubling: "none", level: 3, strain: "NT" } },
      ]),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Board 1/ }));

    expect(screen.getByText("defending")).toBeTruthy();
    expect(screen.queryByText("by them")).toBeNull();
  });

  /**
   * Best first, with your own line wherever it lands — a traveller exists to show
   * where you *came*, and pinning your row to the top answers a different question
   * that the collapsed row above has already answered.
   */
  it("sorts a board's results best first, with yours in its place", () => {
    pad([result("b1", 170, [entry(620, "Computer"), entry(-100, "Computer")])]);
    fireEvent.click(screen.getByRole("button", { name: /Board 1/ }));

    const order = screen
      .getAllByRole("row")
      .map((row) => row.textContent ?? "")
      .filter((text) => text.includes("+") || text.includes("−"));
    expect(order[0]).toContain("+620");
    expect(order[1]).toContain("you");
    expect(order[2]).toContain("−100");
  });

  it("opens a board into everybody's result on it", () => {
    pad(BOARDS);
    fireEvent.click(screen.getByRole("button", { name: /Board 2/ }));

    expect(screen.getByText("Noah")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Board 2/ }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  /**
   * One at a time, because a panel breaks the alignment of the rows around it and
   * that alignment is what makes the list scannable.
   */
  it("shuts the one that was open when another is opened", () => {
    pad(BOARDS);
    fireEvent.click(screen.getByRole("button", { name: /Board 2/ }));
    fireEvent.click(screen.getByRole("button", { name: /Board 1/ }));

    // Board 1 really did open — without this the assertion below passes just as well
    // against a tap that does nothing at all, which is how it passed before the click
    // was fixed to run inside React's act.
    expect(screen.getByRole("button", { name: /Board 1/ }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.queryByText("Noah")).toBeNull();
    expect(screen.getByRole("button", { name: /Board 2/ }).getAttribute("aria-expanded")).toBe(
      "false",
    );
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

    expect(screen.getAllByText("honors +100").length).toBeGreaterThan(0);
  });

  it("says nothing about honors when the contract already accounts for the score", () => {
    pad([result("b1", VULNERABLE, [], [true, false])]);

    expect(screen.queryByText(/honors/)).toBeNull();
  });

  /**
   * Signed the way the points beside it are, because the other side holding them is
   * exactly the case that makes a row baffling.
   */
  it("signs honors toward the side that was paid", () => {
    // 3♥ made exactly pays 90 and a 50 part-score bonus at neither vulnerable, so a
    // recorded 40 is that less the hundred the other side took.
    pad([result("b1", PLAIN, [entry(40, "Noah", "solo")])]);
    fireEvent.click(screen.getByRole("button", { name: /Board 1/ }));

    expect(screen.getByText("honors −100")).toBeTruthy();
  });
});

/**
 * Going back to the hands of a board already played — the placing says how it went
 * and nothing about why, and the why is what was held and what was bid.
 */
describe("looking back at a board", () => {
  it("offers nothing where the board was not kept", () => {
    pad([result("b1", 420, [])]);
    fireEvent.click(screen.getByRole("button", { name: /Board 1/ }));

    expect(screen.queryByRole("button", { name: "Hands and bidding" })).toBeNull();
  });

  /**
   * The pad asks; `GameBoard` draws. A panel owned here would be a modal nested in
   * whichever of the pad's three homes it happened to be drawn in — one of them the
   * Score overlay, another the reveal's own tap-to-continue area.
   */
  it("asks for the board it was tapped on", () => {
    pad([result("b1", 420, []), result("b2", 130, [])], new Map([["b2", REVIEW]]));
    fireEvent.click(screen.getByRole("button", { name: /Board 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hands and bidding" }));

    expect(asked).toEqual([1]);
  });

  /**
   * The board just played is the one somebody asks this of: the placing has just
   * landed and the hands are a tap behind it. That screen has no row to expand, so
   * without its own button there would be no way back at all.
   */
  it("offers it on the board just played, which has no row to open", () => {
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

    expect(screen.getByRole("button", { name: "Hands and bidding" })).toBeTruthy();
  });
});
