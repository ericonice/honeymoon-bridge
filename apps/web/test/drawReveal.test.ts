import { applyAction, cardId, startDeal } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { HUMAN, OPPONENT, lastDrawReveal, revealsUnseenCard } from "../src/game/useGameSession.js";

describe("what a resolved draw turn shows the player", () => {
  it("shows you the card you threw away when you kept card 1", () => {
    const state = startDeal({ seed: 4, starter: HUMAN });
    const cardOne = state.pending!;
    const cardTwo = state.stock[0]!;

    const reveal = lastDrawReveal(applyAction(state, HUMAN, { type: "draw-decide", keep: true }))!;

    // The rules have you look at card 2 before discarding it, so this is the
    // one and only chance the app gets to put it in front of you.
    expect(cardId(reveal.discarded!)).toBe(cardId(cardTwo));
    expect(cardId(reveal.taken!)).toBe(cardId(cardOne));
    expect(revealsUnseenCard(reveal)).toBe(true);
  });

  it("shows you the card you took sight-unseen when you rejected card 1", () => {
    const state = startDeal({ seed: 4, starter: HUMAN });
    const cardOne = state.pending!;
    const cardTwo = state.stock[0]!;

    const reveal = lastDrawReveal(applyAction(state, HUMAN, { type: "draw-decide", keep: false }))!;

    expect(cardId(reveal.taken!)).toBe(cardId(cardTwo));
    expect(cardId(reveal.discarded!)).toBe(cardId(cardOne));
    // You already saw card 1 as the pending card, and card 2 lands in your hand
    // where you can study it, so nothing needs holding up to be read.
    expect(revealsUnseenCard(reveal)).toBe(false);
  });

  it("names neither of the opponent's cards, whichever they chose", () => {
    for (const keep of [true, false]) {
      const state = startDeal({ seed: 9, starter: OPPONENT });
      const reveal = lastDrawReveal(applyAction(state, OPPONENT, { type: "draw-decide", keep }))!;

      expect(reveal.by).toBe(OPPONENT);
      expect(reveal.taken).toBeNull();
      expect(reveal.discarded).toBeNull();
      expect(revealsUnseenCard(reveal)).toBe(false);
    }
  });

  it("reports the choice for both players, since that much is public", () => {
    const state = startDeal({ seed: 9, starter: OPPONENT });
    const kept = lastDrawReveal(applyAction(state, OPPONENT, { type: "draw-decide", keep: true }))!;
    const took = lastDrawReveal(applyAction(state, OPPONENT, { type: "draw-decide", keep: false }))!;

    expect(kept.choice).toBe("kept-first");
    expect(took.choice).toBe("took-second");
  });

  it("has nothing to show before the first turn", () => {
    expect(lastDrawReveal(startDeal({ seed: 1, starter: HUMAN }))).toBeNull();
  });

  it("advances the turn number so a repeated choice still replays", () => {
    let state = startDeal({ seed: 12, starter: HUMAN });
    state = applyAction(state, HUMAN, { type: "draw-decide", keep: true });
    expect(lastDrawReveal(state)!.turn).toBe(1);

    state = applyAction(state, OPPONENT, { type: "draw-decide", keep: true });
    expect(lastDrawReveal(state)!.turn).toBe(2);
  });
});
