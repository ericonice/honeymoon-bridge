// @vitest-environment jsdom
import {
  applyFieldAction,
  finishedHandsFor,
  legalActionsForView,
  nextFieldDeal,
  startField,
  summarizeField,
  viewFor,
} from "@hb/engine";
import type { DealAction, FieldBoard, FieldState, PlayerId, PlayerView } from "@hb/engine";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { reviewKeyOf, useBoardReviews } from "../src/game/boardReview.js";
import type { GameSession } from "../src/game/session.js";

/**
 * What the client keeps of a Doop board so it can be looked at again.
 *
 * Driven through the engine rather than built as a fixture, because what is under
 * test is *when* a board becomes reviewable — and a hand-made "complete" view would
 * agree with the hook by construction while saying nothing about the states a real
 * session passes through on the way there.
 */

const ME: PlayerId = 0;

const ONE: FieldBoard = {
  ids: ["board-1", null],
  seed: 20260929,
  starter: 0,
  vulnerable: [true, false],
};

const TWO: FieldBoard = {
  ids: ["board-2", null],
  seed: 20260930,
  starter: 1,
  vulnerable: [false, true],
};

/**
 * A driver that actually reaches a contract.
 *
 * Taking the first legal action passes every deal out, which is the dead end
 * `returnMatch.test.ts` hit: a passed-out board has no hands to reveal, so the case
 * under test would never arise. This opens the cheapest contract instead and then
 * plays whatever is legal.
 */
function next(view: PlayerView): DealAction {
  const legal = legalActionsForView(view);
  if (view.phase === "auction") {
    const opening =
      view.auction.length === 0
        ? legal.find((one) => one.type === "call" && one.call.type === "bid")
        : undefined;
    return opening ?? legal.find((one) => one.type === "call" && one.call.type === "pass") ?? legal[0]!;
  }
  return legal[0]!;
}

/** Applies `steps` actions to the deal on the table, whoever is to act. */
function advance(state: FieldState, steps: number): FieldState {
  let played = state;
  for (let taken = 0; taken < steps && played.deal.phase !== "complete"; taken += 1) {
    const actor = played.deal.toAct;
    played = applyFieldAction(played, actor, next(viewFor(played.deal, actor)));
  }
  return played;
}

/** Plays the deal on the table out to its thirteenth trick. */
function finish(state: FieldState): FieldState {
  return advance(state, Infinity);
}

/** How many actions a whole board takes, so a test can stop one short of the end. */
function lengthOf(board: FieldBoard): number {
  let state = startField({ boards: [board] });
  let taken = 0;
  while (state.deal.phase !== "complete") {
    state = advance(state, 1);
    taken += 1;
  }
  return taken;
}

/** The two fields of a session the hook actually reads, as a session. */
function sessionOf(state: FieldState): GameSession {
  return {
    standing: { kind: "field", summary: summarizeField(state, ME) },
    view: viewFor(state.deal, ME),
  } as unknown as GameSession;
}

function keptFrom(state: FieldState): ReturnType<typeof useBoardReviews> {
  return renderHook(() => useBoardReviews(sessionOf(state))).result.current;
}

describe("keeping a board to look at again", () => {
  it("keeps the hands, the auction and the tricks once a board is finished", () => {
    const state = finish(startField({ boards: [ONE] }));
    expect(state.deal.phase).toBe("complete");

    const kept = keptFrom(state).get(reviewKeyOf(ONE, ME));

    expect(kept).toBeDefined();
    expect(kept!.hands[0]).toHaveLength(13);
    expect(kept!.hands[1]).toHaveLength(13);
    // The same thirteen the engine hands the reveal, rather than a second reading.
    expect(kept!.hands).toEqual(finishedHandsFor(viewFor(state.deal, ME)));
    expect(kept!.auction.length).toBeGreaterThan(0);
    expect(kept!.tricks[0] + kept!.tricks[1]).toBe(13);
  });

  it("keeps nothing while the first board is still being played", () => {
    const state = advance(startField({ boards: [ONE] }), lengthOf(ONE) - 1);
    expect(state.deal.phase).not.toBe("complete");

    expect(keptFrom(state).size).toBe(0);
  });

  /**
   * **The state this is really guarding, and the one the first two cannot reach.**
   * Once a board has been committed there is a result to file a review against on
   * every later render — so a hook that filed whatever the view held would put the
   * board *in progress* under the *finished* board's key, and the pad would offer
   * the wrong hands under the right heading.
   *
   * Rendered fresh at that moment rather than carried through from the finished
   * board, which is exactly what opening the Score overlay mid-board does, and which
   * is what stops the "already kept" check hiding the fault.
   */
  it("keeps nothing from the board in progress, even with a finished one behind it", () => {
    const state = advance(nextFieldDeal(finish(startField({ boards: [ONE, TWO] }))), 20);
    expect(state.results).toHaveLength(1);
    expect(state.deal.phase).not.toBe("complete");

    expect(keptFrom(state).size).toBe(0);
  });

  it("keeps both boards of a session played through", () => {
    const state = finish(nextFieldDeal(finish(startField({ boards: [ONE, TWO] }))));

    // Rendered once per state, as the app does, so each board is filed as it lands.
    const { rerender, result } = renderHook(({ at }: { at: FieldState }) => useBoardReviews(sessionOf(at)), {
      initialProps: { at: finish(startField({ boards: [ONE, TWO] })) },
    });
    rerender({ at: state });

    expect([...result.current.keys()]).toEqual([reviewKeyOf(ONE, ME), reviewKeyOf(TWO, ME)]);
  });

  /**
   * A claim ends a deal with cards still in a hand, so there is no full thirteen to
   * show and the pad offers no way back into it — which is the honest answer rather
   * than a partial reveal of a hand that was never played out.
   */
  it("keeps nothing from a board finished by a claim", () => {
    let state = advance(startField({ boards: [ONE] }), 30);
    while (!legalActionsForView(viewFor(state.deal, state.deal.toAct)).some((one) => one.type === "claim")) {
      state = advance(state, 1);
    }
    state = applyFieldAction(state, state.deal.toAct, { type: "claim" });
    state = applyFieldAction(state, state.deal.toAct, { type: "claim-response", accept: true });

    expect(state.deal.phase).toBe("complete");
    expect(state.results).toHaveLength(1);
    expect(keptFrom(state).size).toBe(0);
  });

  it("keeps nothing in a format that has no boards to look back at", () => {
    const rubber = {
      standing: { kind: "rubber" },
      view: viewFor(finish(startField({ boards: [ONE] })).deal, ME),
    } as unknown as GameSession;

    expect(useBoardReviewsIn(rubber).size).toBe(0);
  });

  /**
   * Filing and looking up are two call sites, and a comment saying they agree is not
   * a mechanism — which is exactly what `boardKeyOf` was extracted for after the copy
   * the app used and the copy the bench used turned out to differ.
   */
  it("files a board under the id the pad looks it up by", () => {
    expect([...keptFrom(finish(startField({ boards: [ONE] }))).keys()]).toEqual([
      reviewKeyOf(ONE, ME),
    ]);
  });

  it("names a stream with no id of its own by its seed and starter", () => {
    expect(reviewKeyOf({ ...ONE, ids: [null, null] }, ME)).toBe("20260929:0");
  });
});

function useBoardReviewsIn(session: GameSession): ReturnType<typeof useBoardReviews> {
  return renderHook(() => useBoardReviews(session)).result.current;
}
