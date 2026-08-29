// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { newRubber } from "@hb/engine";
import type {
  Contract,
  DealRecord,
  Pair,
  PlayerId,
  PlayerView,
  ScoreDetail,
} from "@hb/engine";
import { afterEach, describe, expect, test } from "vitest";
import { Scorepad } from "../src/ui/Scorepad.js";

afterEach(() => {
  cleanup();
});

const ME: PlayerId = 0;
const THEM: PlayerId = 1;
const CONTRACT: Contract = { declarer: ME, doubling: "none", level: 2, strain: "H" };

/** A deal that paid `mine` below the line to me and `theirs` to the opponent. */
function record(
  mine: number,
  theirs: number,
  honors: Pair<number> = [0, 0],
  starter: PlayerId = ME,
): DealRecord {
  const detail: ScoreDetail = {
    contractTricks: 8,
    honors,
    insult: 0,
    made: true,
    overtricks: 0,
    slamBonus: 0,
    undertricks: 0,
  };

  return {
    contract: CONTRACT,
    score: { aboveLine: [0, 0], belowLine: [mine, theirs], detail },
    starter,
    tricksWon: [8, 5],
    wonGameBy: null,
  };
}

const view = { me: ME, opponent: THEM } as PlayerView;

function show(previous: readonly DealRecord[], history: readonly DealRecord[] = [record(60, 0)]): void {
  render(
    createElement(Scorepad, {
      history,
      opponentName: "Computer",
      previous,
      rubber: newRubber("rubber"),
      view,
    }),
  );
}

const text = (): string => document.body.textContent ?? "";

describe("the scorepad on a return match", () => {
  /**
   * **Rows are holdings and columns are players, which is the one arrangement that is
   * both truthful and aligned.**
   *
   * Per deal it cannot be: a replay swaps the seats, so the two figures worth
   * comparing always end up diagonally opposite. The version that forced them into a
   * column did it by reversing them under a "You" heading, which reads as your own
   * score and says the opposite of the truth — that shipped, and was reported as
   * exactly that confusion.
   *
   * Here the earlier deal has this seat drawing *second* and the opponent scoring 90.
   * So "they drew first" is the row that holds their 90, and it sits in their column,
   * because it is their score. Reverse anything and 90 lands in the wrong row or the
   * wrong column.
   */
  test("puts each score under the holding it was made with", () => {
    // All four figures differ, so every one of them can land in exactly one place.
    // This run I drew first: I made 120, they made 30. The first run they drew first:
    // they made 90, I made 40.
    show([record(40, 90, [0, 0], THEM)], [record(120, 30, [0, 0], ME)]);

    const first = screen.getByText("you drew first").closest("div");
    const second = screen.getByText("they drew first").closest("div");

    // The first drawer's holding: mine when I had it, theirs when they had it. Side by
    // side, which is the comparison a replay exists to make.
    expect(first?.textContent).toContain("120");
    expect(first?.textContent).toContain("90");

    // The second drawer's holding, the same way — and neither of the first drawer's
    // figures may appear on it, which is what would break if anything were reversed.
    expect(second?.textContent).toContain("40");
    expect(second?.textContent).toContain("30");
    expect(second?.textContent).not.toContain("120");
    expect(second?.textContent).not.toContain("90");
  });

  /** Both auctions survive, labelled by the same handle the rows use. */
  test("names both auctions, and which draw each belongs to", () => {
    show([record(0, 90, [0, 0], THEM)], [record(120, 0, [0, 0], ME)]);

    expect(screen.getByText("when you drew first")).toBeTruthy();
    expect(screen.getByText("when they drew first")).toBeTruthy();
  });

  test("says what it is showing", () => {
    show([record(0, 90, [0, 0], THEM)], [record(120, 0, [0, 0], ME)]);

    expect(text()).toContain("the other side");
  });

  test("an ordinary rubber shows no comparison at all", () => {
    show([], [record(60, 0)]);

    expect(screen.queryByText("you drew first")).toBeNull();
    expect(text()).not.toContain("the other side");
  });
});

describe("who was paid honors", () => {
  /**
   * **Reported as a scoring bug and it is not one.** Honors go to whoever holds them,
   * defender included, so a deal can pay both sides — and the shape that reads as
   * broken is a contract going down while its declarer still scores more than the
   * side that set them. Over 400 deals 20 paid both sides and all 20 were honors; the
   * pad simply never said the word. A quarter of deals pay them here, because each
   * hand holds thirteen of twenty-six dealt cards and the draw selects for high ones.
   */
  test("names them, so points the contract does not explain are accounted for", () => {
    show([], [record(0, 50, [100, 0])]);

    const line = screen.getByText("honors").parentElement;
    expect(line?.textContent).toContain("100");
  });

  test("says nothing when nobody held them", () => {
    show([], [record(60, 0)]);

    expect(screen.queryByText("honors")).toBeNull();
  });
});
