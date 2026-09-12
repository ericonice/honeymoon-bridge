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
    lastCompleted: null,
    margin,
    // Not exercised by anything in this file, which is about the pad's layout
    // rather than what a real score would be — reusing `margin` is a
    // type-safe placeholder, not a claim that the two agree in general.
    points: margin,
    schedule: "halves",
    score: null,
    scoring: "points",
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

/** The IMPs column's own per-board cells, in board order — empty string for an open board. */
function impCells(): string[] {
  return [
    ...document.querySelectorAll('[class="min-h-6 py-0.5 text-right tabular-nums text-white/50"]'),
  ].map((el) => (el.textContent ?? "").trim());
}

/**
 * Every board row's two cells, in order, so a column can be read rather than searched.
 *
 * Matched on the class as an attribute substring rather than as a CSS class, because
 * `py-0.5` needs escaping as a selector and the escape is easier to get wrong than the
 * thing it is testing.
 */
function cells(): string[] {
  return [...document.querySelectorAll('[class~="py-0.5"]')].flatMap((row) => {
    // The index, then the two-column pair nested one level in of its own —
    // see `SessionPad`'s doc for why the pair is its own wrapper rather than
    // two direct children of the row.
    const pair = row.children[1];
    // The cell's own children joined by a space: they are flex items, so their text runs
    // together in `textContent` and "=" would abut the total it sits beside.
    return [...(pair?.children ?? [])].map((cell) =>
      [...cell.children]
        .map((part) => part.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  });
}

/** The two column totals, which are the point of the columns. */
function feet(): string[] {
  const foot = document.querySelector(".mt-1.flex.items-baseline");
  const pair = foot?.children[1];
  return [...(pair?.children ?? [])].map((one) => (one.textContent ?? "").trim());
}

describe("a session's scorepad", () => {
  /**
   * Every board's row is on the pad from the first deal on, not only once it has
   * a run in — see `SessionPad`'s own doc for why an earlier version withheld it.
   * Both cells are blank, the same blank an unfinished board's other cell already
   * used, so nothing new needs a caption.
   */
  it("shows every board's row before anything has been played", () => {
    show(summaryOf([board(), board({ board: 1 })], [0, 0]));
    expect(cells()).toEqual(["", "", "", ""]);
  });

  it("names which order the session was dealt in", () => {
    show({ ...summaryOf([board()], [0, 0]), schedule: "sequence" });
    expect(text()).toContain("In order");
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
    // The columns are first play and replay, said once at the top rather than once
    // per run — which is what buys the room for both figures to sit side by side.
    expect(shown).toContain("First play");
    expect(shown).toContain("Replay");
    // Side by side, in that order, so the board's worth is the two of them added up.
    expect(cells()).toEqual(["4♥ you = +420", "3♥ opp = −170"]);
    // 420 − 170 = 250, and the session total is the only place it is stated.
    expect(shown).toContain("+250");
  });

  /**
   * **IMPs needs its own column, because the two run cells cannot say it on
   * their own.** They stay in raw points either way — that is what was
   * actually bid and made — so a board's own IMPs has nowhere else to come
   * from but a figure of its own, board by board, the same as the run cells
   * are. An open board has nothing to convert yet, so its cell is blank
   * rather than a guess.
   */
  it("shows each closed board's own IMPs alongside its two runs, and nothing for an open one", () => {
    show({
      ...summaryOf(
        [
          board({
            margin: 250,
            played: [
              run({ points: 420 }),
              run({ contract: contract(3, "H", THEM), points: 170, replay: true, tricksWon: [4, 9] }),
            ],
          }),
          board({ board: 1, played: [run({ board: 1, points: 90 })] }),
        ],
        [340, -340],
      ),
      scoring: "imps",
    });

    expect(text()).toContain("IMPs");
    expect(text()).toContain("Session (IMPs)");
    // impsFor(250) = 6 — see packages/engine/test/duplicate.test.ts's own table.
    // The second board is still open, so its cell has nothing to convert yet.
    expect(impCells()).toEqual(["+6", ""]);
  });

  /**
   * A cell rendering literally nothing has no child node at all, and a block with no
   * inline content collapses to zero height — so an open board's row in the IMPs
   * column would vanish rather than hold its place, and every closed board after it
   * would climb the column until it no longer lined up with its own row next door.
   * A non-breaking space is a real, uncollapsible child that keeps the row's height
   * while still reading as blank once whitespace is trimmed.
   */
  it("keeps an open board's IMPs cell from collapsing, so later boards still line up with their row", () => {
    show({
      ...summaryOf(
        [
          board({
            margin: 250,
            played: [run({ points: 420 }), run({ points: 170, replay: true })],
          }),
          board({ board: 1 }),
        ],
        [250, -250],
      ),
      scoring: "imps",
    });

    const openCell = document.querySelectorAll(
      '[class="min-h-6 py-0.5 text-right tabular-nums text-white/50"]',
    )[1];
    expect(openCell?.childNodes.length).toBeGreaterThan(0);
  });

  /**
   * A fully unplayed board has nothing but its own small index number to set the
   * row's height under `items-baseline` — shorter than a row where a run cell's
   * text-sm content does, and shorter than the always-text-sm IMPs column beside
   * it. Every such row before a closed board shaved a little more off, until the
   * two columns no longer agreed on which row was which. `min-h-6` is a floor
   * that keeps every board row — played or not — the same height as the column
   * next to it.
   */
  it("keeps a fully unplayed board's row from shrinking below the IMPs column's own row height", () => {
    show({
      ...summaryOf(
        [
          board({
            margin: 250,
            played: [run({ points: 420 }), run({ points: 170, replay: true })],
          }),
          board({ board: 1 }),
        ],
        [250, -250],
      ),
      scoring: "imps",
    });

    const rows = [...document.querySelectorAll('[class~="py-0.5"]')].filter(
      (el) => el.tagName === "DIV",
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.className).toContain("min-h-6");
    }
  });

  /**
   * The board rows have to sit at the same text size as the run cells beside them, or the
   * two columns' rows are different heights and drift out of line further down the list —
   * `text-xs` shared across the whole column once did exactly that.
   */
  it("keeps the IMPs column's board rows at the same text size as the run cells beside them", () => {
    show({
      ...summaryOf(
        [board({ margin: 250, played: [run({ points: 420 }), run({ points: 170, replay: true })] })],
        [250, -250],
      ),
      scoring: "imps",
    });

    const cell = document.querySelector('[class="min-h-6 py-0.5 text-right tabular-nums text-white/50"]');
    expect(cell?.parentElement?.className).not.toContain("text-xs");
  });

  /** Points says nothing about IMPs at all — the default needs no label. */
  it("says nothing about IMPs when the session is scored in points", () => {
    show(summaryOf([board({ played: [run({ points: 420 })] })], [420, -420]));
    expect(text()).not.toContain("IMPs");
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
   * each player both sides of every board, so what you made across every first play
   * against what you made across every replay is a comparison with the luck already
   * cancelled — organised by *when*, the same axis mirror's own two halves use.
   */
  it("foots first play and replay separately", () => {
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
            // They drew first here, so this board's first play is *their* run —
            // the column is about when a run happened, not which side you held.
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

    // First play: +420 on board 1, −110 on board 2 (their run, so negated to you).
    // Replay: −170 on board 1, +50 on board 2 (your run there). The two feet are
    // those sums and nothing else.
    expect(feet()).toEqual(["+310", "−120"]);
  });

  it("foots the column with the session total", () => {
    show(summaryOf([board({ margin: 250, played: [run({ points: 250 })] })], [250, -250]));
    expect(screen.getByText("Session")).toBeTruthy();
  });

  /**
   * `lastCompleted` marks a run, not a board — a closed board's *other* cell
   * must stay unmarked, and so must every other board's, or the highlight says
   * nothing more precise than "something happened recently".
   */
  it("highlights the cell that most recently completed, and nothing else", () => {
    show({
      ...summaryOf(
        [
          board({
            played: [
              run({ points: 420 }),
              run({ contract: contract(3, "H", THEM), points: 170, replay: true }),
            ],
          }),
          board({
            board: 1,
            played: [run({ board: 1, contract: contract(4, "S", ME), points: 90 })],
          }),
        ],
        [0, 0],
      ),
      lastCompleted: { board: 1, replay: false },
    });

    const marked = [...document.querySelectorAll('[class*="bg-amber-300/10"]')].map((element) =>
      (element.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(marked).toEqual(["4♠ you =+90"]);
  });

  it("marks nothing when nothing has completed yet", () => {
    show(summaryOf([board({ played: [run({ points: 420 })] })], [0, 0]));
    expect(document.querySelectorAll('[class*="bg-amber-300/10"]')).toHaveLength(0);
  });
});
