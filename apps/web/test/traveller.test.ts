// @vitest-environment jsdom
import type { FieldEntry, FieldResult, Pair, PlayerId } from "@hb/engine";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Traveller } from "../src/ui/Traveller.js";

/**
 * A board's traveller: every result on it, yours among them.
 *
 * It used to live inside the session pad, expanded from a row; it is the substance
 * of a board's own panel now. These are the rules it carried with it.
 */

const ME: PlayerId = 0;

function entry(points: number, who: string, over: Partial<FieldEntry> = {}): FieldEntry {
  return {
    contract: { declarer: 0, doubling: "none", level: 3, strain: "H" },
    kind: "computer",
    points,
    tricks: [9, 4],
    who,
    ...over,
  };
}

function result(
  mine: number,
  field: readonly FieldEntry[] | null,
  vulnerable: Pair<boolean> = [false, false],
): FieldResult {
  return {
    board: { ids: ["b1", null], seed: 1, starter: 0, vulnerable },
    contract: { declarer: 0, doubling: "none", level: 4, strain: "S" },
    field: [field, null],
    points: [mine, 0],
    tricks: [10, 3],
  };
}

function traveller(one: FieldResult): void {
  render(createElement(Traveller, { at: 0, me: ME, result: one }));
}

afterEach(cleanup);

describe("a board's traveller", () => {
  /**
   * **Said, not implied.** It used to read "by them", which named a different person
   * on every row — and on somebody else's line it reads as *your* opponent rather
   * than theirs. A defender's row is the one that needs saying, because a defender
   * of a contract that made scores nothing and a bare zero explains itself to nobody.
   */
  it("says which rows were defending, on their own terms", () => {
    traveller(
      result(620, [
        entry(-100, "Noah", {
          contract: { declarer: 1, doubling: "none", level: 3, strain: "NT" },
          kind: "solo",
        }),
      ]),
    );

    expect(screen.getByText("defending")).toBeTruthy();
    expect(screen.queryByText("by them")).toBeNull();
  });

  /**
   * Best first, with your own line wherever it lands — a traveller exists to show
   * where you *came*, and pinning your row to the top answers a different question,
   * which the row that opened this has already answered.
   */
  it("sorts a board's results best first, with yours in its place", () => {
    traveller(result(170, [entry(620, "Computer"), entry(-100, "Computer")]));

    const order = screen
      .getAllByRole("row")
      .map((row) => row.textContent ?? "")
      .filter((text) => text.includes("+") || text.includes("−"));
    expect(order[0]).toContain("+620");
    expect(order[1]).toContain("you");
    expect(order[2]).toContain("−100");
  });

  /**
   * Honors go to whoever *holds* them, so a recorded row can perfectly well have
   * been paid for them by the side it was playing against — and signed the way the
   * figure beside it is, or the reader has to work out which side gained.
   */
  it("signs a recorded row's honors toward that row's own player", () => {
    // 3♥ made exactly pays 90 and a 50 part-score bonus at neither vulnerable, so a
    // recorded 240 is that plus a hundred and 40 is that less one.
    traveller(result(620, [entry(240, "Computer"), entry(40, "Computer")]));

    expect(screen.getByText("honors +100")).toBeTruthy();
    expect(screen.getByText("honors −100")).toBeTruthy();
  });

  /**
   * A field that has not come back and a board nobody else has played are different
   * answers, and neither of them is a placing of nought.
   */
  it("tells a field that has not arrived from one that is empty", () => {
    traveller(result(620, null));
    expect(screen.getByText("waiting for the other results")).toBeTruthy();

    cleanup();
    traveller(result(620, []));
    expect(screen.getByText("nobody else has played this board yet")).toBeTruthy();
  });

  /** The board's own panel names the board, so the caption would say it twice. */
  it("can be drawn without its caption", () => {
    render(createElement(Traveller, { at: 0, caption: false, me: ME, result: result(620, []) }));

    expect(screen.queryByText("Board 1")).toBeNull();
  });
});
