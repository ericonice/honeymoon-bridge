// @vitest-environment jsdom
import { startDeal, summarizeField } from "@hb/engine";
import type { FieldEntry, FieldResult, FieldState, PlayerId } from "@hb/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FieldPad } from "../src/ui/FieldPad.js";

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

function result(id: string, mine: number, field: readonly FieldEntry[] | null): FieldResult {
  return {
    board: { ids: [id, null], seed: 1, starter: 0, vulnerable: [false, false] },
    contract: { declarer: 0, doubling: "none", level: 4, strain: "S" },
    field: [field, null],
    points: [mine, 0],
    tricks: [10, 3],
  };
}

function pad(results: readonly FieldResult[]): void {
  const state: FieldState = {
    at: results.length,
    boards: results.map((one) => one.board),
    deal: startDeal({ seed: 1, starter: 0 }),
    results,
  };
  render(createElement(FieldPad, { me: ME, summary: summarizeField(state, ME) }));
}

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
    render(createElement(FieldPad, { latest: true, me: ME, summary: summarizeField(state, ME) }));

    expect(screen.getByText("Noah")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Board 1/ })).toBeNull();
  });
});
