import { describe, expect, it } from "vitest";
import { cardId, opponentOf } from "../src/cards.js";
import { BASE_RULES, applyAction, legalActions, startDeal } from "../src/deal.js";
import { nextDeal, startTable } from "../src/table.js";
import type { DealState, DrawTake, PlayerId } from "../src/types.js";
import { drawRevealFor, revealsUnseenCard, viewFor } from "../src/view.js";

const OPEN = { openDiscard: true };

function openDeal(seed: number, starter: PlayerId = 0): DealState {
  return startDeal({ rules: OPEN, seed, starter });
}

/** Drives the draw to its end, asking `choose` what each turn should take. */
function playOutDraw(state: DealState, choose: (state: DealState) => DrawTake): DealState {
  let current = state;
  while (current.phase === "draw") {
    current = applyAction(current, current.toAct, { type: "draw-decide", take: choose(current) });
  }
  return current;
}

/** Takes off the pile whenever the rules allow it, which is every turn but the first. */
const greedy = (state: DealState): DrawTake => (state.discardTop === null ? "first" : "discard");

function takes(state: DealState, player: PlayerId): DrawTake[] {
  return legalActions(state, player).map((action) =>
    action.type === "draw-decide" ? action.take : "first",
  );
}

describe("the open discard", () => {
  it("is off in the game as specified, and the move does not exist", () => {
    const state = startDeal({ seed: 5, starter: 0 });
    expect(state.rules).toEqual(BASE_RULES);

    const second = applyAction(state, 0, { type: "draw-decide", take: "first" });
    expect(second.discardTop).not.toBeNull();
    expect(takes(second, 1)).toEqual(["first", "second"]);
    expect(() => applyAction(second, 1, { type: "draw-decide", take: "discard" })).toThrow();
  });

  it("has nothing to offer on the first turn of the deal", () => {
    const state = openDeal(5);
    expect(state.discardTop).toBeNull();
    expect(takes(state, 0)).toEqual(["first", "second"]);
    expect(() => applyAction(state, 0, { type: "draw-decide", take: "discard" })).toThrow();
  });

  it("offers a third card once there is a pile, and only to the player on turn", () => {
    const state = applyAction(openDeal(5), 0, { type: "draw-decide", take: "first" });
    expect(takes(state, 1)).toEqual(["first", "second", "discard"]);
    expect(legalActions(state, 0)).toEqual([]);
  });

  /**
   * The property the whole variant rests on. Turns alternate and every turn ends
   * by covering the pile with a card the acting player threw, so what is on offer
   * is never your own throw — it is always their most recent one. That is what
   * makes the card you discard a card you are handing over.
   */
  it("always offers the opponent's own last discard", () => {
    let state = openDeal(77);
    while (state.phase === "draw") {
      if (state.discardTop !== null) {
        expect(state.discardTop.by).toBe(opponentOf(state.toAct));
      }
      state = applyAction(state, state.toAct, { type: "draw-decide", take: "first" });
    }
  });

  it("takes the offered card into hand and throws both of its own", () => {
    const first = applyAction(openDeal(21), 0, { type: "draw-decide", take: "first" });
    const offered = first.discardTop!.card;
    const cardOne = first.pending!;
    const cardTwo = first.stock[0]!;

    const after = applyAction(first, 1, { type: "draw-decide", take: "discard" });

    expect(after.hands[1].map(cardId)).toContain(cardId(offered));
    expect(after.discards[1].map(cardId)).toEqual([cardId(cardOne), cardId(cardTwo)]);
    // Card 2 is left on top, so the next turn is offered the card this one never
    // saw before committing.
    expect(cardId(after.discardTop!.card)).toBe(cardId(cardTwo));
    expect(after.discardTop!.by).toBe(1);
  });

  /**
   * A card back in play is not a card that is provably nowhere, and `discards` is
   * what a bot's recall is built from — leaving it there would have the thrower
   * believing a card it can see in the other hand cannot be held by anyone.
   */
  it("takes the card off the thrower's own discards, since it is back in play", () => {
    const first = applyAction(openDeal(21), 0, { type: "draw-decide", take: "first" });
    expect(first.discards[0]).toHaveLength(1);

    const after = applyAction(first, 1, { type: "draw-decide", take: "discard" });
    expect(after.discards[0]).toEqual([]);
  });

  it("still spends two stock cards a turn, so the deck runs out on turn 26", () => {
    const finished = playOutDraw(openDeal(303), greedy);

    expect(finished.phase).toBe("auction");
    expect(finished.drawTurns).toHaveLength(26);
    expect(finished.hands[0]).toHaveLength(13);
    expect(finished.hands[1]).toHaveLength(13);
    expect(finished.stock).toEqual([]);
  });

  it("keeps every card of the deck accounted for exactly once", () => {
    const finished = playOutDraw(openDeal(304), greedy);
    const everything = [
      ...finished.hands[0],
      ...finished.hands[1],
      ...finished.discards[0],
      ...finished.discards[1],
    ];

    expect(everything).toHaveLength(52);
    expect(new Set(everything.map(cardId)).size).toBe(52);
    // 26 thrown in total, as under the base rules — the pile loses one and gains
    // two on a `took-discard`, which is the same net card a turn.
    expect(finished.discards[0].length + finished.discards[1].length).toBe(26);
  });

  it("counts a taken card against the taker's thirteen turns like any other", () => {
    // Seat 1 takes off the pile at every opportunity, seat 0 never can on turn
    // one and then never does — so the two are drawing under different policies
    // and must still finish level.
    const finished = playOutDraw(openDeal(305), (state) =>
      state.toAct === 1 && state.discardTop !== null ? "discard" : "first",
    );

    expect(finished.drawTurns.filter((turn) => turn.by === 0)).toHaveLength(13);
    expect(finished.drawTurns.filter((turn) => turn.by === 1)).toHaveLength(13);
    expect(finished.drawTurns.some((turn) => turn.choice === "took-discard")).toBe(true);
  });

  it("still holds up card 2, which this turn threw away without seeing", () => {
    const first = applyAction(openDeal(21), 0, { type: "draw-decide", take: "first" });
    const after = applyAction(first, 1, { type: "draw-decide", take: "discard" });

    const mine = drawRevealFor(after, 1)!;
    expect(mine.choice).toBe("took-discard");
    expect(mine.discarded).toHaveLength(2);
    expect(revealsUnseenCard(mine)).toBe(true);

    // The other seat is shown the choice, and the one card it was already looking
    // at — the card it threw, lying face up, that they have just picked up. Neither
    // of their own two.
    const theirs = drawRevealFor(after, 0)!;
    expect(theirs.choice).toBe("took-discard");
    expect(theirs.discarded).toEqual([]);
    expect(cardId(theirs.taken!)).toBe(cardId(first.discardTop!.card));
    expect(revealsUnseenCard(theirs)).toBe(false);
  });

  it("names their taken card to nobody when the pile is not open", () => {
    const base = startDeal({ seed: 21, starter: 0 });
    const first = applyAction(base, 0, { type: "draw-decide", take: "first" });
    const after = applyAction(first, 1, { type: "draw-decide", take: "second" });

    expect(drawRevealFor(after, 0)!.taken).toBeNull();
  });
});

describe("what the open discard shows each seat", () => {
  it("shows the same face-up card to both, since it is lying on the table", () => {
    const state = applyAction(openDeal(31), 0, { type: "draw-decide", take: "first" });
    const top = state.discardTop!.card;

    expect(viewFor(state, 0).discardTop).toEqual(top);
    expect(viewFor(state, 1).discardTop).toEqual(top);
  });

  it("shows nobody anything once the draw is over", () => {
    const finished = playOutDraw(openDeal(32), greedy);

    expect(finished.phase).toBe("auction");
    expect(finished.discardTop).not.toBeNull();
    for (const seat of [0, 1] as PlayerId[]) {
      expect(viewFor(finished, seat).discardTop).toBeNull();
    }
  });

  it("still shows neither seat any other discard", () => {
    const state = playOutDraw(openDeal(33), (current) =>
      current.drawTurns.length < 8 ? greedy(current) : "first",
    );
    const view = viewFor(state, 0);
    const serialized = JSON.stringify(view);
    const onOffer = view.discardTop === null ? "" : cardId(view.discardTop);

    for (const card of [...state.discards[0], ...state.discards[1]]) {
      if (cardId(card) !== onOffer) {
        expect(serialized).not.toContain(JSON.stringify(card));
      }
    }
  });

  it("tells each seat which rules it is playing under", () => {
    expect(viewFor(openDeal(34), 0).rules.openDiscard).toBe(true);
    expect(viewFor(startDeal({ seed: 34, starter: 0 }), 0).rules.openDiscard).toBe(false);
  });

  /**
   * A rubber is one sitting under one set of rules. Deals after the first come
   * from `nextDeal`, which has to carry them for the same reason it carries the
   * match format — nothing re-reads the setting, which could have moved since.
   */
  it("carries the rules into every later deal of the rubber", () => {
    const table = startTable({ rules: OPEN, seed: 34, starter: 0 });
    expect(nextDeal(table, 35).deal.rules.openDiscard).toBe(true);
  });
});
