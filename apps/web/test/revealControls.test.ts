// @vitest-environment jsdom
import {
  applyFieldAction,
  duplicateScoreFor,
  legalActionsForView,
  startField,
  summarizeField,
  viewFor,
} from "@hb/engine";
import type { DealAction, FieldBoard, FieldState, PlayerId, PlayerView } from "@hb/engine";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement, createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardReviewing } from "../src/game/boardReview.js";
import { PlayPhase } from "../src/ui/PlayPhase.js";
import { stubBrowser } from "./support/board.js";

/**
 * **A control inside the reveal is that control's, not the screen's.**
 *
 * The whole reveal is tap-to-continue, and its second stage draws a pad inside it —
 * which was fine while a pad was only ever figures, and stopped being fine the moment
 * one grew a button. Reported from real play as the two fighting: a tap on the pad's
 * own control did what it asked *and* went on to the next deal in the same gesture,
 * so what had been asked for landed on a screen already left behind.
 *
 * The control there is the board's own tab row now rather than a button opening a
 * panel, which makes this sharper: switching to the deal is a thing you do *while*
 * reading the reveal, so a tap that also continued would take the screen away at the
 * exact moment it was asked for.
 */

const ME: PlayerId = 0;

const BOARD: FieldBoard = {
  ids: ["board-1", null],
  seed: 20260929,
  starter: 0,
  vulnerable: [true, false],
};

/** Reaches a real contract rather than passing the deal out. */
function next(view: PlayerView): DealAction {
  const legal = legalActionsForView(view).filter((one) => one.type !== "claim");
  if (view.phase === "auction") {
    const opening =
      view.auction.length === 0
        ? legal.find((one) => one.type === "call" && one.call.type === "bid")
        : undefined;
    return opening ?? legal.find((one) => one.type === "call" && one.call.type === "pass") ?? legal[0]!;
  }
  return legal[0]!;
}

function playedOut(): FieldState {
  let state = startField({ boards: [BOARD] });
  while (state.deal.phase !== "complete") {
    const actor = state.deal.toAct;
    state = applyFieldAction(state, actor, next(viewFor(state.deal, actor)));
  }
  return state;
}

let continued: number;

beforeEach(() => {
  vi.useFakeTimers();
  stubBrowser();
  continued = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The reveal of a finished Doop board, with the board kept so it can be reopened. */
function revealFinishedBoard(kept: boolean): void {
  const state = playedOut();
  const view = viewFor(state.deal, ME);
  const summary = summarizeField(state, ME);
  const reviews: BoardReviewing = {
    kept: kept
      ? new Map([
          [
            "board-1",
            { auction: view.auction, hands: [view.hand, view.hand], tricks: view.tricksWon },
          ],
        ])
      : new Map(),
    open: () => {},
  };

  render(
    createElement(PlayPhase, {
      dealBonus: duplicateScoreFor(state.deal, BOARD.vulnerable)?.bonus ?? 0,
      dealScore: duplicateScoreFor(state.deal, BOARD.vulnerable)?.deal ?? null,
      format: "field",
      handOriginRef: createRef<DOMRect | null>(),
      lastTrick: view.completedTricks[view.completedTricks.length - 1] ?? null,
      matchDetail: true,
      onContinue: () => {
        continued += 1;
      },
      onDismissTrick: () => {},
      onHandsSettled: () => {},
      onShowingStandingChange: () => {},
      opponentName: "Computer",
      opponentWaitingToContinue: false,
      ratings: { mine: null, opponent: null },
      release: null,
      reviews,
      revealedHands: [view.hand, view.hand],
      standing: { kind: "field", summary },
      thinking: false,
      trickCount: true,
      view,
      vulnerable: BOARD.vulnerable,
      waitingToContinue: false,
    }),
  );

  // The last trick's hold and sweep, then the reveal's first stage, then the tap that
  // asks for the pad — which is the stage the button is drawn in.
  act(() => {
    vi.advanceTimersByTime(8000);
  });
  tapTable();
}

/** `PlayPhase`'s own root, which is the element carrying the tap-to-continue. */
function tapTable(): void {
  const table = document.body.firstElementChild?.firstElementChild;
  act(() => {
    (table as HTMLElement | undefined)?.click();
  });
}

describe("a control inside the reveal", () => {
  it("switches to the deal without continuing", () => {
    revealFinishedBoard(true);

    act(() => {
      screen.getByRole("button", { name: "The deal" }).click();
    });

    expect(screen.getByText("The hands")).toBeTruthy();
    expect(continued).toBe(0);
  });

  /**
   * The anti-vacuity half: the reveal really is tap-to-continue, so a test finding
   * that a tap did not continue says nothing unless a tap elsewhere does.
   */
  it("still continues on a tap that is not on a control", () => {
    revealFinishedBoard(true);
    tapTable();

    expect(continued).toBe(1);
  });

  it("offers no tabs for a board it kept nothing of", () => {
    revealFinishedBoard(false);

    expect(screen.queryByRole("button", { name: "The deal" })).toBeNull();
  });
});
