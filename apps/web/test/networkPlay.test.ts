// @vitest-environment jsdom
import { cardId, legalActionsForView } from "@hb/engine";
import type { PlayerId } from "@hb/engine";
import { snapshotFor } from "@hb/protocol";
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { board, renderBoard, settle, stubBrowser } from "./support/board.js";

function buttonSaying(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((button) => button.textContent === text);
}

/** Taps a card the way a finger does, rather than through the click fallback. */
function tap(element: HTMLElement): void {
  const row = element.closest<HTMLElement>("[class*='touch-none']") ?? element;
  for (const type of ["pointerdown", "pointerup"]) {
    const event = new MouseEvent(type, { bubbles: true, clientX: 0, clientY: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    act(() => {
      row.dispatchEvent(event);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  stubBrowser();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * Plays `deals` deals from this seat, with `pause` milliseconds of animation
 * allowed to run between actions — the seat opposite is under no obligation to
 * wait for this screen, so a short pause is the realistic case rather than the
 * pathological one.
 *
 * Every card this seat plays goes through the rendered hand and is checked to
 * have actually been playable, which is the whole point: a card the rules allow
 * and the screen will not take is a deal that cannot be finished.
 */
function playDeals({
  deals,
  pause,
  seat,
  tapToSelect = false,
  useGesture = false,
}: {
  readonly deals: number;
  readonly pause: number;
  readonly seat: PlayerId;
  readonly tapToSelect?: boolean;
  readonly useGesture?: boolean;
}): void {
  renderBoard({ seat, seed: 7, tapToSelect });
  settle(pause);

  for (let deal = 1; deal <= deals; deal += 1) {
    for (let step = 0; step < 200; step += 1) {
      const state = board.state;
      if (state.deal.phase === "complete") {
        break;
      }
      const actor = state.deal.toAct;
      const view = snapshotFor({ kind: "rubber", table: state }, actor).view;
      const legal = legalActionsForView(view).filter((action) => action.type !== "claim");
      const where = `deal ${deal}, ${state.deal.phase}, trick ${state.deal.completedTricks.length + 1}`;
      expect(legal.length, `no legal action at ${where}`).toBeGreaterThan(0);

      if (state.deal.phase === "play" && actor === seat) {
        // The board holds a closed auction open for the declarer until it is
        // dismissed by hand — that tap is part of playing, not a fault.
        const start = buttonSaying("Start play");
        if (start !== undefined) {
          act(() => {
            start.click();
          });
          settle(pause);
        }
        const play = legal.find((action) => action.type === "play")!;
        const id = cardId(play.card);
        const button = document.querySelector<HTMLButtonElement>(`button[data-card-id="${id}"]`);
        expect(button, `${where}: no button for ${id}, hand of ${view.hand.length}`).not.toBeNull();
        expect(button!.disabled, `${where}: ${id} is not tappable`).toBe(false);
        if (useGesture) {
          tap(button!);
          if (tapToSelect) {
            // The first tap only raises the card; the second is what plays it.
            tap(button!);
          }
        } else {
          act(() => {
            button!.click();
          });
        }
        expect(
          board.state.deal.completedTricks.length * 2 + board.state.deal.currentTrick.length,
          `${where}: tapping ${id} played nothing`,
        ).toBe(view.completedTricks.length * 2 + view.currentTrick.length + 1);
      } else {
        const bidding = state.deal.phase === "auction";
        const action =
          bidding && view.auction.length === 0
            ? (legal.find((call) => call.type === "call" && call.call.type === "bid") ?? legal[0]!)
            : bidding
              ? (legal.find((call) => call.type === "call" && call.call.type === "pass") ?? legal[0]!)
              : legal[0]!;
        board.apply(actor, action);
      }
      settle(pause);
    }

    expect(board.state.deal.phase, `deal ${deal} never finished`).toBe("complete");
    expect(board.state.deal.completedTricks.length, `deal ${deal} tricks`).toBe(13);

    if (deal < deals) {
      settle(4000);
      board.next();
      settle(pause);
    }
  }
}

test("a networked seat can play every card of a deal, the last one included", () => {
  playDeals({ deals: 1, pause: 4000, seat: 0 });
});

test("a second and third deal play the same, with the opponent never waiting", () => {
  playDeals({ deals: 3, pause: 30, seat: 0 });
});

test("the second seat can play every card too", () => {
  playDeals({ deals: 2, pause: 30, seat: 1 });
});

test("every card is reachable by tap rather than by click", () => {
  playDeals({ deals: 2, pause: 30, seat: 0, useGesture: true });
});

test("every card is reachable with tap-to-select on", () => {
  playDeals({ deals: 2, pause: 30, seat: 0, tapToSelect: true, useGesture: true });
});
