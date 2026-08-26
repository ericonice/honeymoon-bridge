import { describe, expect, it } from "vitest";
import type { Card, DrawChoice, DrawReveal, PlayerId } from "@hb/engine";
import { drawPlayout } from "../src/game/timing.js";

const CARD: Card = { rank: 12, suit: "S" };
const ME: PlayerId = 0;
const THEM: PlayerId = 1;

/**
 * `discarded` is what marks a turn as this seat's own, and `taken` is filled in for
 * the seat's own turn *or* for a card the opponent lifted off the open pile — which
 * is the distinction the whole of `drawPlayout` turns on.
 */
function reveal(options: {
  readonly by: PlayerId;
  readonly choice: DrawChoice;
  readonly discarded: readonly Card[];
  readonly taken: Card | null;
}): DrawReveal {
  return { ...options, turn: 4 };
}

const myKeep = reveal({ by: ME, choice: "kept-first", discarded: [CARD], taken: CARD });
const myReject = reveal({ by: ME, choice: "took-second", discarded: [CARD], taken: CARD });
/** Their turn: the choice is public and neither card is. */
const theirKeep = reveal({ by: THEM, choice: "kept-first", discarded: [], taken: null });

describe("how a resolved draw turn plays out", () => {
  it("travels for your own turn and holds card 2 when the turn threw it", () => {
    expect(drawPlayout(myKeep, false).animated).toBe(true);
    expect(drawPlayout(myKeep, false).holdsReveal).toBe(true);
    // Card 2 went into the hand, where it stays on screen; nothing to hold up.
    expect(drawPlayout(myReject, false).holdsReveal).toBe(false);
  });

  it("is only a pause for their turn, since neither of their cards can be shown", () => {
    expect(drawPlayout(theirKeep, false).animated).toBe(false);
    expect(drawPlayout(theirKeep, false).holdsReveal).toBe(false);
  });

  it("plays their turn exactly as yours once their cards are showing", () => {
    expect(drawPlayout(theirKeep, true).animated).toBe(true);
    expect(drawPlayout(theirKeep, true).holdsReveal).toBe(true);
    expect(drawPlayout(theirKeep, true).duration).toBe(drawPlayout(myKeep, false).duration);
  });
});
