import { describe, expect, it } from "vitest";
import { applyAction, legalActions, startDeal } from "../src/deal.js";
import { cardId } from "../src/cards.js";
import type { DealState, PlayerId } from "../src/types.js";

function playOutDraw(state: DealState, keepDecisions: (turn: number) => boolean): DealState {
  let current = state;
  let turn = 0;
  while (current.phase === "draw") {
    current = applyAction(current, current.toAct, {
      type: "draw-decide",
      take: keepDecisions(turn) ? "first" : "second",
    });
    turn++;
  }
  return current;
}

describe("draw phase", () => {
  it("deals 13 cards to each player and consumes the whole deck", () => {
    const finished = playOutDraw(startDeal({ seed: 1, starter: 0 }), () => true);

    expect(finished.hands[0]).toHaveLength(13);
    expect(finished.hands[1]).toHaveLength(13);
    expect(finished.discards[0]).toHaveLength(13);
    expect(finished.discards[1]).toHaveLength(13);
    expect(finished.stock).toHaveLength(0);
    expect(finished.pending).toBeNull();
  });

  it("takes exactly 26 turns regardless of the decisions made", () => {
    const alwaysKeep = playOutDraw(startDeal({ seed: 7, starter: 0 }), () => true);
    const alwaysReject = playOutDraw(startDeal({ seed: 7, starter: 0 }), () => false);
    const alternating = playOutDraw(startDeal({ seed: 7, starter: 0 }), (turn) => turn % 2 === 0);

    expect(alwaysKeep.drawTurns).toHaveLength(26);
    expect(alwaysReject.drawTurns).toHaveLength(26);
    expect(alternating.drawTurns).toHaveLength(26);
  });

  it("never loses or duplicates a card", () => {
    const finished = playOutDraw(startDeal({ seed: 42, starter: 1 }), (turn) => turn % 3 !== 0);

    const all = [
      ...finished.hands[0],
      ...finished.hands[1],
      ...finished.discards[0],
      ...finished.discards[1],
    ].map(cardId);

    expect(all).toHaveLength(52);
    expect(new Set(all).size).toBe(52);
  });

  it("strictly alternates turns starting with the starter", () => {
    const finished = playOutDraw(startDeal({ seed: 3, starter: 1 }), () => true);

    const expected: PlayerId[] = [];
    for (let i = 0; i < 26; i++) {
      expected.push(i % 2 === 0 ? 1 : 0);
    }
    expect(finished.drawTurns.map((turn) => turn.by)).toEqual(expected);
  });

  it("keeping card 1 puts card 1 in hand and discards the card drawn after it", () => {
    const state = startDeal({ seed: 11, starter: 0 });
    const first = state.pending!;
    const second = state.stock[0]!;

    const after = applyAction(state, 0, { type: "draw-decide", take: "first" });

    expect(after.hands[0].map(cardId)).toEqual([cardId(first)]);
    expect(after.discards[0].map(cardId)).toEqual([cardId(second)]);
    expect(after.drawTurns[0]!.choice).toBe("kept-first");
  });

  it("rejecting card 1 takes card 2 sight-unseen", () => {
    const state = startDeal({ seed: 11, starter: 0 });
    const first = state.pending!;
    const second = state.stock[0]!;

    const after = applyAction(state, 0, { type: "draw-decide", take: "second" });

    expect(after.hands[0].map(cardId)).toEqual([cardId(second)]);
    expect(after.discards[0].map(cardId)).toEqual([cardId(first)]);
    expect(after.drawTurns[0]!.choice).toBe("took-second");
  });

  it("reveals a fresh card 1 to the next player after each turn", () => {
    const state = startDeal({ seed: 5, starter: 0 });
    const after = applyAction(state, 0, { type: "draw-decide", take: "first" });

    expect(after.toAct).toBe(1);
    expect(after.pending).not.toBeNull();
    expect(cardId(after.pending!)).not.toBe(cardId(state.pending!));
  });

  it("moves to the auction with the starter making the first call", () => {
    const finished = playOutDraw(startDeal({ seed: 9, starter: 1 }), () => true);

    expect(finished.phase).toBe("auction");
    expect(finished.toAct).toBe(1);
    expect(finished.initialHands).not.toBeNull();
  });

  it("rejects an action from the player who is not on turn", () => {
    const state = startDeal({ seed: 2, starter: 0 });
    expect(() => applyAction(state, 1, { type: "draw-decide", take: "first" })).toThrow();
  });

  it("offers exactly the keep and reject actions to the player on turn", () => {
    const state = startDeal({ seed: 2, starter: 0 });
    expect(legalActions(state, 0)).toHaveLength(2);
    expect(legalActions(state, 1)).toHaveLength(0);
  });

  it("is reproducible from its seed", () => {
    const first = playOutDraw(startDeal({ seed: 12345, starter: 0 }), () => true);
    const second = playOutDraw(startDeal({ seed: 12345, starter: 0 }), () => true);

    expect(first.hands[0].map(cardId)).toEqual(second.hands[0].map(cardId));
    expect(first.hands[1].map(cardId)).toEqual(second.hands[1].map(cardId));
  });
});
