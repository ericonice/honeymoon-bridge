// @vitest-environment jsdom
import type { Card, FieldEntry, FieldResult, PlayerId } from "@hb/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { BoardReview as Review } from "../src/game/boardReview.js";
import { BoardReview } from "../src/ui/BoardReview.js";
import { stubBrowser } from "./support/board.js";

/**
 * The two questions a finished board raises, and the one seam between them.
 *
 * A third tab for the auction was proposed and turned down: a bridge player reads an
 * auction *against* a holding, so separating them makes the one comparison this
 * panel exists for into a toggle. The field and the deal are genuinely asked one at
 * a time — why that percentage, and could I have done better.
 */

const ME: PlayerId = 0;

beforeAll(stubBrowser);
afterEach(cleanup);

function thirteen(suit: Card["suit"]): readonly Card[] {
  return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((rank) => ({ rank, suit }) as Card);
}

const REVIEW: Review = {
  auction: [
    { by: 0, call: { type: "bid", bid: { level: 4, strain: "S" } } },
    { by: 1, call: { type: "pass" } },
  ],
  hands: [thirteen("S"), thirteen("H")],
  tricks: [10, 3],
};

const OTHERS: readonly FieldEntry[] = [
  { contract: { declarer: 0, doubling: "none", level: 3, strain: "H" }, kind: "computer", points: 140, tricks: [9, 4], who: "Computer" },
];

const RESULT: FieldResult = {
  board: { ids: ["b1", null], seed: 1, starter: 0, vulnerable: [false, false] },
  contract: { declarer: 0, doubling: "none", level: 4, strain: "S" },
  field: [OTHERS, null],
  points: [420, 0],
  tricks: [10, 3],
};

function panel(): void {
  render(
    createElement(BoardReview, {
      at: 6,
      me: ME,
      onBack: null,
      onClose: () => {},
      opponentName: "Computer",
      result: RESULT,
      review: REVIEW,
    }),
  );
}

function tab(name: string): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("a board's two tabs", () => {
  it("opens on the field, with the deal not drawn behind it", () => {
    panel();

    expect(screen.getByText("Computer")).toBeTruthy();
    expect(screen.queryByText("The hands")).toBeNull();
    expect(document.querySelectorAll(".card-face")).toHaveLength(0);
  });

  it("swaps to the hands and the bidding, and takes the field away", () => {
    panel();
    tab("The deal");

    expect(screen.getByText("The hands")).toBeTruthy();
    expect(screen.getByText("The bidding")).toBeTruthy();
    // Both thirteens, drawn as cards — twenty-six faces and nothing left out.
    expect(document.querySelectorAll(".card-face")).toHaveLength(26);
    // The traveller is gone rather than scrolled past: no table, and no row of
    // yours in it.
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("you")).toBeNull();
  });

  /**
   * **The one seam that was argued about.** A third tab would have put these on
   * separate screens; a reader working out whether a contract was sane needs the
   * auction and the holding it was made on together.
   */
  it("keeps the bidding on the same tab as the hands", () => {
    panel();
    tab("The deal");

    const deal = screen.getByText("The hands").closest("div")?.parentElement;
    expect(deal?.textContent).toContain("The bidding");
    expect(document.querySelectorAll(".card-face").length).toBeGreaterThan(0);
  });

  it("goes back to the field", () => {
    panel();
    tab("The deal");
    tab("The field");

    expect(screen.getByText("Computer")).toBeTruthy();
    expect(screen.queryByText("The hands")).toBeNull();
  });

  /**
   * The header is above both, because what the contract was and what it came to is
   * the answer to "what happened" — wanted on either tab, and what makes the two
   * labels mean anything.
   */
  it("keeps the contract and the placing on screen whichever tab is up", () => {
    panel();
    const onField = document.body.textContent ?? "";
    tab("The deal");
    const onDeal = document.body.textContent ?? "";

    for (const text of [onField, onDeal]) {
      expect(text).toContain("by you");
      expect(text).toContain("+420");
    }
  });
});
