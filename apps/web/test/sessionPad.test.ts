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
  return {
    board: 0,
    contract: contract(4, "H", ME),
    replay: false,
    score: null,
    tricksWon: [10, 3],
    ...over,
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
    // And says the board is not decided, rather than letting one run read as one.
    expect(text()).toContain("still to come round");
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
              run({ contract: contract(3, "H", THEM), points: 170, replay: true }),
            ],
          }),
        ],
        [250, -250],
      ),
    );

    const shown = text();
    expect(shown).toContain("you drew");
    expect(shown).toContain("they drew");
    expect(shown).toContain("4♥");
    expect(shown).toContain("3♥");
    expect(shown).toContain("+420");
    expect(shown).toContain("−170");
    expect(shown).toContain("+250");
    expect(shown).not.toContain("still to come round");
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

  it("names a passed-out run rather than leaving its line blank", () => {
    show(summaryOf([board({ played: [run({ contract: null, points: 0 })] })], [0, 0]));
    expect(screen.getByText("Passed out")).toBeTruthy();
  });

  it("foots the column with the session total", () => {
    show(summaryOf([board({ margin: 250, played: [run({ points: 250 })] })], [250, -250]));
    expect(screen.getByText("Session")).toBeTruthy();
  });
});
