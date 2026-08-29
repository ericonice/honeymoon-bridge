// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type {
  BoardOutcome,
  Contract,
  DuplicateResult,
  DuplicateSummary,
  Level,
  Pair,
  PlayerId,
  PlayerView,
  Strain,
} from "@hb/engine";
import { scoreDeal } from "@hb/engine";
import { afterEach, describe, expect, it } from "vitest";
import { SessionPad } from "../src/ui/SessionPad.js";

afterEach(() => {
  cleanup();
});

const ME: PlayerId = 0;
const THEM: PlayerId = 1;

function contract(level: Level, strain: Strain, declarer: PlayerId): Contract {
  return { declarer, doubling: "none", level, strain };
}

/**
 * One run of a board. `points` is signed toward whoever drew first *on that run*,
 * which is the convention the pad has to undo to show a column from one seat.
 */
function run(over: Partial<DuplicateResult> & { readonly points: number }): DuplicateResult {
  const filled = {
    board: 0,
    contract: contract(4, "H", ME),
    replay: false,
    tricksWon: [10, 3] as Pair<number>,
    ...over,
  };
  return {
    ...filled,
    // Scored through the engine rather than hand-built, so the mark in the cell is the
    // one a real deal would carry — and a fixture cannot quietly disagree with scoring.
    score:
      over.score !== undefined || filled.contract === null
        ? (over.score ?? null)
        : {
            bonus: 0,
            deal: scoreDeal(
              { contract: filled.contract, hands: [[], []], tricksWon: filled.tricksWon },
              [false, false],
            ),
            points: [0, 0],
          },
  };
}

function board(over: Partial<BoardOutcome> = {}): BoardOutcome {
  return { board: 0, margin: null, played: [], starter: ME, ...over };
}

function summaryOf(boards: readonly BoardOutcome[], margin: Pair<number>): DuplicateSummary {
  return {
    boards,
    current: { board: 0, replay: false },
    closed: boards.filter((one) => one.margin !== null).length,
    complete: false,
    dealsPlayed: boards.reduce((total, one) => total + one.played.length, 0),
    margin,
    score: null,
    vulnerable: [false, false],
    winner: null,
  };
}

const VIEW = { me: ME, opponent: THEM } as unknown as PlayerView;

function show(summary: DuplicateSummary): void {
  render(createElement(SessionPad, { summary, view: VIEW }));
}

/** The rendered text with runs of whitespace collapsed — the rows are flex items. */
function text(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

/**
 * Every board row's two cells, in order, so a column can be read rather than searched.
 *
 * Matched on the class as an attribute substring rather than as a CSS class, because
 * `py-0.5` needs escaping as a selector and the escape is easier to get wrong than the
 * thing it is testing.
 */
function cells(): string[] {
  return [...document.querySelectorAll('[class~="py-0.5"]')].flatMap((row) =>
    // The cell's own children joined by a space: they are flex items, so their text runs
    // together in `textContent` and "=" would abut the total it sits beside.
    [...row.children]
      .slice(1)
      .map((cell) =>
        [...cell.children]
          .map((part) => part.textContent ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      ),
  );
}

/** The two column totals, which are the point of the columns. */
function feet(): string[] {
  const foot = document.querySelector(".mt-1.flex.items-baseline");
  return [...(foot?.children ?? [])].slice(1).map((one) => (one.textContent ?? "").trim());
}

describe("a session's scorepad", () => {
  it("says so before anything has been played", () => {
    show(summaryOf([board()], [0, 0]));
    expect(screen.getByText("No deals yet.")).toBeTruthy();
  });

  /**
   * The first thing a player wants after finishing a deal is what just happened.
   * An earlier version listed closed boards only — half a board being a score with
   * nothing to compare it to — which was true and withheld exactly that.
   */
  it("shows a deal as soon as it is played, before its board is settled", () => {
    show(summaryOf([board({ played: [run({ points: 420 })] })], [0, 0]));

    expect(text()).toContain("4♥");
    expect(text()).toContain("+420");
    // And the other column is empty, which is what says the board is not decided —
    // an earlier version spent words on it, where a blank cell already means "no deal
    // there" everywhere else on this pad.
    expect(cells()).toEqual(["4♥ you = +420", ""]);
  });

  /**
   * Both runs together once the board closes, each with what was bid — and the
   * board's figure is visibly the **sum** of the two, not a difference to be taken
   * on trust. `netTo` is what makes the column one seat's all the way down.
   */
  it("shows both runs of a closed board, with the margin as their sum", () => {
    show(
      summaryOf(
        [
          board({
            // You drew first and made 4♥ for 420. They drew first on the replay and
            // made only 3♥ for 170, so that run is −170 to you.
            margin: 250,
            played: [
              run({ points: 420 }),
              // Nine tricks to them, which is 3♥ made exactly — so the cell reads `=`
              // and the fixture agrees with itself about what happened.
              run({
                contract: contract(3, "H", THEM),
                points: 170,
                replay: true,
                tricksWon: [4, 9],
              }),
            ],
          }),
        ],
        [250, -250],
      ),
    );

    const shown = text();
    // The columns are the two sides of the stock, said once at the top rather than
    // once per run — which is what buys the room for both figures to sit side by side.
    expect(shown).toContain("You drew");
    expect(shown).toContain("They drew");
    // Side by side, in that order, so the board's worth is the two of them added up.
    expect(cells()).toEqual(["4♥ you = +420", "3♥ opp = −170"]);
    // 420 − 170 = 250, and the session total is the only place it is stated.
    expect(shown).toContain("+250");
  });

  /** A flat board is a real result — both runs came to the same thing. */
  it("shows a flat board as nothing in it rather than as nothing there", () => {
    show(
      summaryOf(
        [board({ margin: 0, played: [run({ points: 140 }), run({ points: 140, replay: true })] })],
        [0, 0],
      ),
    );

    expect(text()).toContain("+140");
    expect(text()).toContain("−140");
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("names a passed-out run rather than leaving its cell blank", () => {
    show(summaryOf([board({ played: [run({ contract: null, points: 0 })] })], [0, 0]));
    // Said in words, because an empty cell has one meaning here and this is not it.
    expect(screen.getByText("passed out")).toBeTruthy();
  });

  /**
   * The two feet, which are the reason the columns are what they are. Duplication hands
   * each player both sides of every board, so what you made holding the first draw
   * against what you made holding the second is a comparison with the luck already
   * cancelled — and it was in the old pad's numbers without ever being added up.
   */
  it("foots each side of the stock separately", () => {
    show(
      summaryOf(
        [
          board({
            margin: 250,
            played: [
              run({ points: 420 }),
              run({ contract: contract(3, "H", THEM), points: 170, replay: true }),
            ],
          }),
          board({
            board: 1,
            margin: -60,
            // They drew first on this board, so your two cells are the other way round.
            starter: THEM,
            played: [
              run({ board: 1, contract: contract(2, "S", THEM), points: 110 }),
              run({ board: 1, contract: contract(2, "S", ME), points: 50, replay: true }),
            ],
          }),
        ],
        [190, -190],
      ),
    );

    // Holding the first draw: +420 on board 1 and +50 on board 2. Holding the second:
    // −170 and −110. The two feet are those sums and nothing else.
    expect(feet()).toEqual(["+470", "−280"]);
  });

  it("foots the column with the session total", () => {
    show(summaryOf([board({ margin: 250, played: [run({ points: 250 })] })], [250, -250]));
    expect(screen.getByText("Session")).toBeTruthy();
  });
});
