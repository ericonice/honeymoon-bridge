import { describe, expect, it } from "vitest";
import { applyAction, legalActions, legalPlays, startDeal } from "../src/deal.js";
import { legalActionsForView, viewFor } from "../src/view.js";
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

/** Plays exactly `tricks` tricks, always choosing the first legal card, and stops. */
function playTricks(state: DealState, tricks: number): DealState {
  let current = state;
  let played = 0;
  while (played < tricks) {
    const before = current.completedTricks.length;
    const card = legalPlays(current, current.toAct)[0]!;
    current = applyAction(current, current.toAct, { type: "play", card });
    if (current.completedTricks.length > before) {
      played++;
    }
  }
  return current;
}

/** A deal set up to a contract and one trick into play. */
function midPlay(seed: number): DealState {
  let state = completeDraw(startDeal({ seed, starter: 0 }));
  state = call(state, { type: "bid", bid: { level: 1, strain: "NT" } });
  state = call(state, { type: "pass" });
  return playTricks(state, 1);
}

describe("offering a claim", () => {
  it("is available alongside every playable card, only during play, only on your turn", () => {
    const state = midPlay(1);
    const player = state.toAct;
    const opponent = player === 0 ? 1 : 0;

    expect(legalActions(state, player)).toContainEqual({ type: "claim" });
    expect(legalActions(state, opponent)).toEqual([]);
    expect(legalActionsForView(viewFor(state, player))).toContainEqual({ type: "claim" });
  });

  it("hands the decision to the opponent and reveals the claimant's hand to them", () => {
    const state = midPlay(2);
    const claimant = state.toAct;
    const opponent = claimant === 0 ? 1 : 0;

    const claimed = applyAction(state, claimant, { type: "claim" });

    expect(claimed.claim).toBe(claimant);
    expect(claimed.revealed).toBe(claimant);
    expect(claimed.toAct).toBe(opponent);

    const opponentView = viewFor(claimed, opponent);
    expect(opponentView.claim).toBe(claimant);
    expect(opponentView.revealedHand).toEqual({ by: claimant, cards: claimed.hands[claimant] });

    // The claimant already has their own hand in `hand`; nothing new to reveal.
    expect(viewFor(claimed, claimant).revealedHand).toBeNull();
  });

  it("leaves the claimant with nothing to do until it is answered", () => {
    const state = midPlay(3);
    const claimant = state.toAct;
    const claimed = applyAction(state, claimant, { type: "claim" });

    expect(legalActions(claimed, claimant)).toEqual([]);
  });

  it("offers only accept or deny to the responder, nothing else", () => {
    const state = midPlay(4);
    const claimant = state.toAct;
    const opponent = claimant === 0 ? 1 : 0;
    const claimed = applyAction(state, claimant, { type: "claim" });

    expect(legalActions(claimed, opponent)).toEqual([
      { type: "claim-response", accept: true },
      { type: "claim-response", accept: false },
    ]);
  });

  it("cannot be offered while a claim is already pending, or outside the play phase", () => {
    const state = midPlay(1);
    const claimant = state.toAct;
    const claimed = applyAction(state, claimant, { type: "claim" });

    expect(() => applyAction(claimed, claimant, { type: "claim" })).toThrow();

    const duringAuction = call(completeDraw(startDeal({ seed: 9, starter: 0 })), {
      type: "bid",
      bid: { level: 1, strain: "NT" },
    });
    expect(() => applyAction(duringAuction, duringAuction.toAct, { type: "claim" })).toThrow();
  });
});

describe("accepting a claim", () => {
  it("awards every remaining trick to the claimant and completes the deal", () => {
    const state = midPlay(3);
    const claimant = state.toAct;
    const opponent = claimant === 0 ? 1 : 0;
    const tricksBefore = state.tricksWon[claimant];
    const remaining = 13 - state.completedTricks.length;

    const claimed = applyAction(state, claimant, { type: "claim" });
    const resolved = applyAction(claimed, opponent, { type: "claim-response", accept: true });

    expect(resolved.phase).toBe("complete");
    expect(resolved.claim).toBeNull();
    expect(resolved.tricksWon[claimant]).toBe(tricksBefore + remaining);
    expect(resolved.tricksWon[opponent]).toBe(state.tricksWon[opponent]);
    // Only the tricks actually played are recorded — nothing is fabricated for
    // the claimed remainder, which is what keeps "show last trick" honest.
    expect(resolved.completedTricks).toHaveLength(state.completedTricks.length);
  });
});

describe("denying a claim", () => {
  it("resumes play exactly where it left off, with the hand still revealed", () => {
    const state = midPlay(2);
    const claimant = state.toAct;
    const opponent = claimant === 0 ? 1 : 0;

    const claimed = applyAction(state, claimant, { type: "claim" });
    const denied = applyAction(claimed, opponent, { type: "claim-response", accept: false });

    expect(denied.phase).toBe("play");
    expect(denied.claim).toBeNull();
    expect(denied.toAct).toBe(claimant);
    expect(denied.currentTrick).toEqual(state.currentTrick);
    expect(denied.tricksWon).toEqual(state.tricksWon);
    // The cost of a claim that didn't land: the hand stays visible.
    expect(denied.revealed).toBe(claimant);
    expect(viewFor(denied, opponent).revealedHand).toEqual({
      by: claimant,
      cards: denied.hands[claimant],
    });

    // Play resumes normally — the claimant can just play a card.
    const card = legalPlays(denied, claimant)[0]!;
    expect(() => applyAction(denied, claimant, { type: "play", card })).not.toThrow();
  });

  it("allows claiming again afterwards", () => {
    const state = midPlay(2);
    const claimant = state.toAct;
    const opponent = claimant === 0 ? 1 : 0;

    let current = applyAction(state, claimant, { type: "claim" });
    current = applyAction(current, opponent, { type: "claim-response", accept: false });

    expect(() => applyAction(current, claimant, { type: "claim" })).not.toThrow();
  });

  it("throws if answered by anyone other than the one being asked", () => {
    const state = midPlay(1);
    const claimant = state.toAct;
    const claimed = applyAction(state, claimant, { type: "claim" });

    expect(() =>
      applyAction(claimed, claimant, { type: "claim-response", accept: true }),
    ).toThrow();
  });

  it("throws when nothing is pending", () => {
    const state = midPlay(1);
    expect(() =>
      applyAction(state, state.toAct, { type: "claim-response", accept: true }),
    ).toThrow();
  });
});
