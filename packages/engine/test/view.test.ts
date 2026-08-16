import { describe, expect, it } from "vitest";
import { sortHand } from "../src/cards.js";
import { applyAction, legalPlays, startDeal } from "../src/deal.js";
import { finishedHandsFor, viewFor } from "../src/view.js";
import type { Call, DealState } from "../src/types.js";

function completeDraw(state: DealState): DealState {
  let current = state;
  while (current.phase === "draw") {
    current = applyAction(current, current.toAct, { type: "draw-decide", keep: true });
  }
  return current;
}

function call(state: DealState, c: Call): DealState {
  return applyAction(state, state.toAct, { type: "call", call: c });
}

function playOut(state: DealState): DealState {
  let current = state;
  while (current.phase === "play") {
    const card = legalPlays(current, current.toAct)[0]!;
    current = applyAction(current, current.toAct, { type: "play", card });
  }
  return current;
}

/** A deal bid to a contract, ready for play. */
function toContract(seed: number): DealState {
  let state = completeDraw(startDeal({ seed, starter: 0 }));
  state = call(state, { type: "bid", bid: { level: 1, strain: "NT" } });
  return call(state, { type: "pass" });
}

describe("finishedHandsFor", () => {
  it("is null before the deal completes", () => {
    const state = toContract(1);
    expect(finishedHandsFor(viewFor(state, 0))).toBeNull();
  });

  it("reconstructs both original thirteen-card hands from the played tricks", () => {
    const initial = toContract(1);
    const initialHands = initial.initialHands!;
    const finished = playOut(initial);

    const hands = finishedHandsFor(viewFor(finished, 0));
    expect(hands).toEqual([sortHand(initialHands[0]), sortHand(initialHands[1])]);
    // Either seat's view agrees — nothing here is seat-specific once it is public.
    expect(finishedHandsFor(viewFor(finished, 1))).toEqual(hands);
  });

  it("is null for a deal that ended on an accepted claim", () => {
    let state = toContract(2);
    const card = legalPlays(state, state.toAct)[0]!;
    state = applyAction(state, state.toAct, { type: "play", card });
    const claimant = state.toAct;
    const opponent = claimant === 0 ? 1 : 0;

    state = applyAction(state, claimant, { type: "claim" });
    state = applyAction(state, opponent, { type: "claim-response", accept: true });

    expect(state.phase).toBe("complete");
    expect(finishedHandsFor(viewFor(state, claimant))).toBeNull();
    expect(finishedHandsFor(viewFor(state, opponent))).toBeNull();
  });
});
