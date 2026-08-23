// @vitest-environment jsdom
import { legalActionsForView, trickOutlook } from "@hb/engine";
import type { PlayerId, TrickOutlook } from "@hb/engine";
import { snapshotFor } from "@hb/protocol";
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { playDealOutcome } from "../src/game/soundEffects.js";
import { board, renderBoard, settle, stubBrowser } from "./support/board.js";

vi.mock("../src/game/soundEffects.js", () => ({
  playAchievement: vi.fn(),
  playCall: vi.fn(),
  playCardPlayed: vi.fn(),
  playDealOutcome: vi.fn(),
  playDrawResolve: vi.fn(),
  playRubberWon: vi.fn(),
}));

const outcome = () => vi.mocked(playDealOutcome);

beforeEach(() => {
  vi.useFakeTimers();
  outcome().mockClear();
  stubBrowser();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * One seat's ring, found by where it is drawn rather than by a test-only hook.
 *
 * Both rings hang off the trick slots, and the slots are drawn in seating order —
 * the opponent's above the middle of the table, this seat's below it. So document
 * order *is* which seat a ring belongs to, and reading them that way means a pair
 * drawn on the wrong sides fails these rather than quietly still counting.
 *
 * Picked out by having classed paths, which no other icon on the board does: the
 * rest set `stroke` as an attribute, where these carry Tailwind stroke utilities
 * because the colour is per state.
 */
function ringsFor(mine: boolean): readonly SVGElement[] {
  const rings = [...document.querySelectorAll("svg")].filter(
    (svg) => svg.querySelector("path[class]") !== null,
  );
  if (rings.length !== 2) {
    return [];
  }
  return [rings[mine ? 1 : 0]!];
}

/**
 * One seat's ring, as taken and still to take.
 *
 * Two inks and no more: the ring has one live colour at every point in every deal.
 * `other` catches anything drawn in a third, so a colour ramp creeping back in
 * fails these rather than being counted as one of the two.
 */
function segments(mine: boolean): {
  readonly dim: number;
  readonly lit: number;
  readonly other: number;
} {
  const rings = ringsFor(mine);
  const count = (selector: string): number =>
    rings.reduce((total, svg) => total + svg.querySelectorAll(selector).length, 0);
  return {
    dim: count(`path[class~="stroke-white/20"]`),
    lit: count(`path[class~="stroke-amber-400"]`),
    // The check mark's own stroke is not a segment, so it is excluded by name.
    other: count(
      `path[class]:not([class~="stroke-white/20"]):not([class~="stroke-amber-400"]):not([class~="stroke-table-dark"])`,
    ),
  };
}

/** Whether this seat's ring wears the check that says its target was reached. */
function checked(mine: boolean): boolean {
  return ringsFor(mine).some(
    (svg) => svg.querySelector(`circle[class~="fill-emerald-400"]`) !== null,
  );
}

function outlookNow(seat: PlayerId): TrickOutlook | null {
  const { view } = snapshotFor(board.state, seat);
  if (view.contract === null) {
    return null;
  }
  return trickOutlook({ contract: view.contract, seat, tricksWon: view.tricksWon });
}

/**
 * Bids 4♠, passes it out to that, and leaves the board on the play screen.
 *
 * A deliberate 4♠ rather than whatever the first legal call happens to be: at the
 * one level both seats need seven tricks, so the two targets coincide and a ring
 * that had the seats confused would still draw the right number of segments.
 */
function driveToPlay(seat: PlayerId, seed: number, trickCount = true): void {
  renderBoard({ seat, seed, sound: true, trickCount });
  settle(4000);

  for (let step = 0; step < 400; step += 1) {
    const state = board.state;
    if (state.deal.phase === "play" || state.deal.phase === "complete") {
      break;
    }
    const actor = state.deal.toAct;
    const legal = legalActionsForView(snapshotFor(state, actor).view).filter(
      (action) => action.type !== "claim",
    );
    const spades = legal.find(
      (action) =>
        action.type === "call" &&
        action.call.type === "bid" &&
        action.call.bid.level === 4 &&
        action.call.bid.strain === "S",
    );
    const pass = legal.find((action) => action.type === "call" && action.call.type === "pass");
    board.apply(actor, (state.deal.phase === "auction" ? (spades ?? pass) : null) ?? legal[0]!);
    settle(4000);
  }

  // The auction does not release itself — `useShownPhase` holds it behind "Start
  // play" — so a test that only drives `TableState` never reaches the play screen
  // at all, which is exactly the screen this file is about.
  const start = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Start play",
  );
  act(() => {
    start?.click();
  });
  settle(4000);
}

/**
 * Plays the next card for whichever seat is on turn.
 *
 * `ms` is how much of the aftermath to let run. The default clears everything —
 * the card's flight, the trick's hold, its sweep — which is what walking a whole
 * deal wants. A shorter one stops inside the hold, while the finished trick is
 * still on the table, which is the only window the last trick's own state can be
 * looked at in: after the sweep the hands are revealed and the slots, rings and
 * all, are gone on purpose.
 */
function playOne(ms = 4000): void {
  const state = board.state;
  const legal = legalActionsForView(snapshotFor(state, state.deal.toAct).view).filter(
    (action) => action.type === "play",
  );
  board.apply(state.deal.toAct, legal[0]!);
  settle(ms);
}

/**
 * Plays the deal out and stops *inside* the last trick's hold, with the trick
 * still on the table and the reveal not yet begun. The only window in which the
 * end of a deal can be looked at: after the sweep the hands turn face up and the
 * slots, rings and all, are gone on purpose.
 *
 * Every card gets its full stage time except the last. Cutting the earlier ones
 * short leaves each flight unfinished, and because effects flush at `act`
 * boundaries a later `settle` cannot chain the hold and the sweep in one go.
 */
function playToTheLastTrick(): void {
  const played = (): number => {
    const { view } = snapshotFor(board.state, 0);
    return view.completedTricks.length * 2 + view.currentTrick.length;
  };
  while (board.state.deal.phase === "play") {
    playOne(played() === 25 ? 300 : 4000);
  }
}

test("each seat's ring counts down that seat's own target", () => {
  const targets: number[] = [];
  // A walker is only as good as what is marched past it: this checks the drawn
  // segments against the engine on every trick of two whole deals, from both
  // seats, and counts the live positions it actually reached.
  let live = 0;

  function check(seat: PlayerId): void {
    // Both rings unmount the instant the deal ends — deliberately, since the
    // result is on screen by then — and the card that ends it is played inside
    // this loop, so there is nothing to read on the pass after the last trick.
    if (board.state.deal.phase !== "play") {
      return;
    }
    for (const mine of [true, false] as const) {
      const outlook = outlookNow(mine ? seat : ((1 - seat) as PlayerId))!;
      if (outlook.state === "reached") {
        continue;
      }
      live += 1;
      // One ink for every trick taken, whatever the position — no escalation.
      expect(segments(mine)).toEqual({
        dim: outlook.need,
        lit: outlook.target - outlook.need,
        other: 0,
      });
      expect(checked(mine)).toBe(false);
    }
  }

  for (const seat of [0, 1] as const) {
    cleanup();
    driveToPlay(seat, 7);
    const opening = outlookNow(seat);
    expect(opening, "the auction never settled into a contract").not.toBeNull();
    targets.push(opening!.target);

    // Nothing taken yet: both rings fully drawn, nothing lit, neither checked.
    expect(segments(true)).toEqual({ dim: opening!.target, lit: 0, other: 0 });
    expect(segments(false)).toEqual({ dim: 14 - opening!.target, lit: 0, other: 0 });

    while (board.state.deal.phase === "play") {
      playOne();
      check(seat);
    }
  }

  // 4♠ asks its declarer for ten tricks and its defender for four, so the seat a
  // ring belongs to is what decides its size — which is why this bids past the
  // one level, where the two targets are the same number and nothing would show.
  expect(targets.slice().sort((left, right) => left - right)).toEqual([4, 10]);
  expect(live, "never checked a live ring").toBeGreaterThan(10);
});

/**
 * The state the whole thing was asked for: a deal that can no longer be won, with
 * cards still in hand. With two rings this needs no signal of its own — the side
 * that got there wears the check, and that *is* the other side being out of reach.
 */
test("a deal decided early checks the side that got there, and only that side", () => {
  let checkedEarly = false;

  for (let seed = 1; seed <= 40 && !checkedEarly; seed += 1) {
    cleanup();
    driveToPlay(0, seed);
    if (outlookNow(0) === null) {
      continue;
    }

    while (board.state.deal.phase === "play" && !checkedEarly) {
      playOne();
      const mine = outlookNow(0)!;
      if (mine.state === "open") {
        continue;
      }
      const theirs = outlookNow(1)!;
      const iGotThere = mine.state === "reached";
      // Exactly complementary: the two targets sum to fourteen against thirteen
      // tricks, so one seat is out of reach precisely when the other has arrived.
      expect(theirs.state).toBe(iGotThere ? "gone" : "reached");
      expect(mine.remaining, "this deal went to the last card").toBeGreaterThan(0);

      // The check goes on whichever side reached its own target — the same mark
      // for a contract made and a contract set — and never on both.
      expect(checked(true)).toBe(iGotThere);
      expect(checked(false)).toBe(!iGotThere);

      // The side that fell short is left where it stopped, in the one live ink,
      // which says how far short rather than only that it fell short.
      const short = iGotThere ? theirs : mine;
      expect(segments(!iGotThere)).toEqual({
        dim: short.need,
        lit: short.target - short.need,
        other: 0,
      });
      checkedEarly = true;
    }
  }

  expect(checkedEarly, "no deal in range was decided before its last trick").toBe(true);
});

/**
 * The reason this is tested rather than taken on trust: the verdict now has two
 * possible sources — the trick that decides the deal, and the score that follows
 * — and announcing on both is the same double-announcement bug as the fog horn
 * and the unlock chime, both of which shipped.
 */
test("the deal's outcome sounds once, on the trick that decides it", () => {
  let earlyEnough = false;

  for (let seed = 1; seed <= 40 && !earlyEnough; seed += 1) {
    cleanup();
    outcome().mockClear();
    driveToPlay(0, seed);
    if (outlookNow(0) === null) {
      continue;
    }

    let remainingWhenFired: number | null = null;
    while (board.state.deal.phase === "play") {
      playOne();
      const outlook = outlookNow(0)!;
      if (outlook.state !== "gone" && outlook.state !== "reached") {
        expect(outcome(), "announced a verdict the deal had not reached").not.toHaveBeenCalled();
        continue;
      }
      if (remainingWhenFired === null) {
        expect(outcome(), "the deciding trick did not announce itself").toHaveBeenCalledTimes(1);
        // Won for this seat exactly when it is this seat's own target that arrived.
        expect(outcome()).toHaveBeenCalledWith(outlook.state === "reached");
        remainingWhenFired = outlook.remaining;
      }
    }

    // The score arriving is the same verdict a second time, and stays silent.
    settle(8000);
    expect(outcome()).toHaveBeenCalledTimes(1);

    if (remainingWhenFired !== null && remainingWhenFired > 0) {
      earlyEnough = true;
    }
  }

  expect(earlyEnough, "no deal in range was decided before its last trick").toBe(true);
});

/**
 * The setting exists because this is a matter of taste rather than an open
 * question — somebody who keeps the count in their head does not want it kept for
 * them. Which makes "off draws nothing" the one thing about it worth pinning: a
 * toggle that only dims what it claims to remove is worse than no toggle.
 */
test("turning the count off leaves the play screen with no rings at all", () => {
  driveToPlay(0, 7, false);
  expect(outlookNow(0), "the auction never settled into a contract").not.toBeNull();

  for (let card = 0; card < 6; card += 1) {
    playOne();
    // Counted directly rather than through `segments`, which reads zero both when
    // a ring is blank and when there is no ring — so it would pass this for the
    // wrong reason. The claim is that nothing is drawn at all.
    expect(document.querySelectorAll("svg path[class]")).toHaveLength(0);
  }

  // And the sound is not part of the setting: the deal still announces itself.
  while (board.state.deal.phase === "play") {
    playOne();
  }
  settle(8000);
  expect(outcome()).toHaveBeenCalledTimes(1);
});

/**
 * The case the check is least likely to be seen in and most likely to be wanted:
 * a deal settled by its thirteenth card.
 *
 * This shipped broken, and the test above is why. It walked until a deal was
 * decided, then *skipped* any deal decided on the last trick — which is the one
 * moment `view.phase` flips to "complete" in the same render that would draw the
 * check. The screen goes on showing the play for the trick's hold and its sweep,
 * so there is a real beat to draw it in, and nothing was drawn in it.
 */
test("a contract settled on the last trick still shows the check", () => {
  driveToPlay(0, 7);
  expect(outlookNow(0), "the auction never settled into a contract").not.toBeNull();

  playToTheLastTrick();

  // The engine has finished the deal; the board is still holding the last trick.
  const mine = outlookNow(0)!;
  const theirs = outlookNow(1)!;
  expect(mine.remaining, "this deal did not go to the last card").toBe(0);

  const iGotThere = mine.state === "reached";
  expect(theirs.state).toBe(iGotThere ? "gone" : "reached");
  expect(checked(iGotThere), "the deciding trick drew no check").toBe(true);
  expect(checked(!iGotThere)).toBe(false);
});

/**
 * The reveal is one event, and the headline used to jump the queue.
 *
 * `revealedHands` goes non-null the instant the thirteenth card lands, and the
 * result headline was gated on that alone where every other part of the reveal
 * waits for the trick to sweep. So several lines arrived in a band that had been
 * holding one, and the played cards and the hand below them shifted down while the
 * last trick was still sitting there.
 */
test("the last trick sits undisturbed before the result appears", () => {
  driveToPlay(0, 7);

  playToTheLastTrick();

  // Inside the hold: the deal is scored and the hands are known, and none of it
  // is on screen yet.
  expect(board.state.deal.phase).toBe("complete");
  expect(screen.queryByText("Tap to continue"), "the result arrived over the last trick").toBeNull();
  // Both trick slots are still there. They unmount at the reveal, so counting
  // them is the same question as "is the last trick still on the table".
  const slots = (): number =>
    document.querySelectorAll('[class~="relative"][class~="h-24"][class~="w-16"]').length;
  expect(slots(), "the reveal had already cleared the table").toBe(2);

  // Then the sweep runs, and the whole reveal lands together.
  settle(4000);
  expect(screen.queryByText("Tap to continue")).not.toBeNull();
  expect(slots(), "the slots outlived the trick they were holding").toBe(0);
});
