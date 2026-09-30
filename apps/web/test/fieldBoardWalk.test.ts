// @vitest-environment jsdom
import { legalActionsForView } from "@hb/engine";
import type { FieldBoard, PlayerId } from "@hb/engine";
import { snapshotFor } from "@hb/protocol";
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { board, renderBoard, settle, stubBrowser } from "./support/board.js";

/**
 * A Doop session played on the real board, which is the only way to reach the two
 * things `fieldPad.test.ts` and `overlayBack.test.ts` cannot: that a board's panel
 * *replaces* the Score panel rather than stacking on it, and that a board played
 * here really is reviewable afterwards.
 *
 * Both are `GameBoard`'s, above every component either of those files renders — and
 * they were uncovered until this harness could make a session at all.
 */

const ME: PlayerId = 0;

/** Two boards of a stock that is never dealt again, so the walk is reproducible. */
const BOARDS: readonly FieldBoard[] = [
  { ids: ["walk-1", null], seed: 20260930, starter: 0, vulnerable: [true, false] },
  { ids: ["walk-2", null], seed: 20260931, starter: 1, vulnerable: [false, true] },
];

beforeEach(() => {
  vi.useFakeTimers();
  stubBrowser();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Plays the deal on the table out, preferring a bid so it reaches a contract. */
function playOut(): void {
  for (let step = 0; step < 200; step += 1) {
    const onTable = board.deal;
    if (onTable.phase === "complete") {
      return;
    }
    const actor = onTable.toAct;
    const view = snapshotFor(board.match, actor).view;
    const legal = legalActionsForView(view).filter((action) => action.type !== "claim");
    const opening =
      onTable.phase === "auction" && view.auction.length === 0
        ? legal.find((one) => one.type === "call" && one.call.type === "bid")
        : undefined;
    const passing =
      onTable.phase === "auction"
        ? legal.find((one) => one.type === "call" && one.call.type === "pass")
        : undefined;
    board.apply(actor, opening ?? passing ?? legal[0]!);
    settle(4000);
  }
  throw new Error("the board did not finish");
}

function tap(name: string | RegExp): void {
  act(() => {
    screen.getByRole("button", { name }).click();
  });
}

/** A tap on the table itself, which is what moves the reveal along. */
function tapTable(): void {
  const table = document.querySelector<HTMLElement>("main div");
  act(() => {
    table?.click();
  });
}

/**
 * Passes board 1 out and carries on to board 2.
 *
 * A passed-out board is the honest way to reach a board this device kept nothing of
 * — no card is played, so there is no full thirteen and `finishedHandsFor` answers
 * null. The same state a claim leaves, and the same state every board of a session
 * restored from storage is in.
 */
function passFirstBoardAndMoveOn(): void {
  renderBoard({ fieldBoards: BOARDS, format: "field", seat: ME, seed: 1 });
  // The draw runs first — twenty-six turns of it — and only then is there an
  // auction to pass out.
  for (let step = 0; step < 200; step += 1) {
    const onTable = board.deal;
    if (onTable.phase === "complete") {
      break;
    }
    const actor = onTable.toAct;
    const view = snapshotFor(board.match, actor).view;
    const legal = legalActionsForView(view).filter((one) => one.type !== "claim");
    const pass =
      onTable.phase === "auction"
        ? legal.find((one) => one.type === "call" && one.call.type === "pass")
        : undefined;
    board.apply(actor, pass ?? legal[0]!);
    settle(4000);
  }
  settle(6000);
  tap("Next deal");
  settle(4000);
}

/**
 * Plays board 1 out and carries on to board 2, which is where the score is
 * reachable from: the bar offers no way in on the screen that ends a deal, because
 * that screen is already showing the pad.
 */
function playFirstBoardAndMoveOn(): void {
  renderBoard({ fieldBoards: BOARDS, format: "field", seat: ME, seed: 1 });
  playOut();
  // The last trick's hold and sweep, then the reveal: the hand's own figures, a tap
  // for the board's traveller, and a tap on to the next board.
  settle(8000);
  tapTable();
  tapTable();
  settle(4000);
}

describe("a Doop board on the real screen", () => {
  it("can be opened again from the score once it has been played", () => {
    playFirstBoardAndMoveOn();

    tap("Show the score");
    tap(/Board 1/);

    expect(screen.getByRole("heading", { name: "Board 1" })).toBeTruthy();
    // Opens on the field, and the deal is a tab away — both halves, so a panel that
    // drew only one of them would fail here rather than on whichever was checked.
    expect(screen.getByRole("button", { name: "The field" })).toBeTruthy();
    tap("The deal");
    expect(screen.getByText("The hands")).toBeTruthy();
    expect(document.querySelectorAll(".card-face")).toHaveLength(26);
  });

  /**
   * **Pushed, not stacked**, which is the thing no component test can see: both
   * panels are `Overlay`s, so the fault it replaces looked identical to each of them
   * on its own and only shows as two of them on screen at once.
   */
  it("replaces the score panel rather than stacking a second one on it", () => {
    playFirstBoardAndMoveOn();

    tap("Show the score");
    expect(screen.getByRole("heading", { name: "Score" })).toBeTruthy();

    tap(/Board 1/);
    // One panel, not two: the score's own heading is gone rather than behind it.
    expect(screen.queryByRole("heading", { name: "Score" })).toBeNull();
    expect(screen.getAllByRole("heading", { name: /^(Score|Board 1)$/ })).toHaveLength(1);
    // And exactly one way out of the sheet, rather than one per panel.
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
  });

  it("goes back to the score, with the list still there", () => {
    playFirstBoardAndMoveOn();

    tap("Show the score");
    tap(/Board 1/);
    tap("Back");

    expect(screen.getByRole("heading", { name: "Score" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Board 1/ })).toBeTruthy();
  });

  /**
   * **A board this device kept nothing of still opens, and the score survives it.**
   *
   * Reported from real play as the chevron working sometimes and not others, and as
   * going into a board sometimes doing nothing. It was one fault with two faces: the
   * Score panel is suppressed while a board is showing, so a board with no kept
   * review left *neither* on screen — and with nothing on screen there was nothing
   * to close, so the open board stayed set and every later tap on the strip did
   * nothing at all. One dead tap made the score unreachable for the rest of the
   * sitting.
   *
   * Driven by throwing away what was kept, which is what a reload does to a session
   * restored from storage, and what a claim and a passed-out board do on their own.
   */
  it("opens a board it kept nothing of, and leaves the score reachable", () => {
    passFirstBoardAndMoveOn();

    tap("Show the score");
    tap(/Board 1/);

    // The panel is there rather than the screen left blank, and it is the field —
    // which needs only the board's own result, never the kept hands.
    expect(screen.getByRole("heading", { name: "Board 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "The deal" })).toBeNull();

    // And the way out works, which is the half that made the strip go dead: with
    // nothing drawn there was nothing to close, so the open board stayed set and
    // every later tap did nothing.
    tap("Close");
    tap("Show the score");
    expect(screen.getByRole("heading", { name: "Score" })).toBeTruthy();
  });

  /**
   * The ✕ leaves the sheet rather than stepping back into it — the two controls are
   * different intentions, and a test that only used Back would not tell them apart.
   */
  it("leaves the sheet altogether on the cross", () => {
    playFirstBoardAndMoveOn();

    tap("Show the score");
    tap(/Board 1/);
    tap("Close");

    expect(screen.queryByRole("heading", { name: "Board 1" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Score" })).toBeNull();
  });
});
