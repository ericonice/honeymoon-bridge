import { describe, expect, it } from "vitest";
import { applyAction, legalActions, legalPlays, startDeal } from "../src/deal.js";
import { cardId, hasSuit, opponentOf, sortHand } from "../src/cards.js";
import { outranks } from "../src/auction.js";
import { legalActionsForView, viewFor } from "../src/view.js";
import type { Call, Card, DealState } from "../src/types.js";

function completeDraw(state: DealState): DealState {
  let current = state;
  while (current.phase === "draw") {
    current = applyAction(current, current.toAct, { type: "draw-decide", take: "first" });
  }
  return current;
}

function call(state: DealState, c: Call): DealState {
  return applyAction(state, state.toAct, { type: "call", call: c });
}

/** Drives the play phase to completion, always choosing the first legal card. */
function playOut(state: DealState): DealState {
  let current = state;
  while (current.phase === "play") {
    const card = legalPlays(current, current.toAct)[0]!;
    current = applyAction(current, current.toAct, { type: "play", card });
  }
  return current;
}

describe("full deal", () => {
  it("runs draw, auction and play through to completion", () => {
    let state = completeDraw(startDeal({ seed: 100, starter: 0 }));
    state = call(state, { type: "bid", bid: { level: 1, strain: "NT" } });
    state = call(state, { type: "pass" });

    expect(state.phase).toBe("play");
    expect(state.contract).toEqual({ declarer: 0, doubling: "none", level: 1, strain: "NT" });

    state = playOut(state);

    expect(state.phase).toBe("complete");
    expect(state.completedTricks).toHaveLength(13);
    expect(state.tricksWon[0] + state.tricksWon[1]).toBe(13);
    expect(state.hands[0]).toHaveLength(0);
    expect(state.hands[1]).toHaveLength(0);
  });

  it("has the non-declarer lead to the first trick", () => {
    let state = completeDraw(startDeal({ seed: 200, starter: 0 }));
    state = call(state, { type: "bid", bid: { level: 2, strain: "H" } });
    state = call(state, { type: "pass" });

    expect(state.contract!.declarer).toBe(0);
    expect(state.trickLeader).toBe(1);
    expect(state.toAct).toBe(1);
  });

  it("completes the deal immediately when passed out", () => {
    let state = completeDraw(startDeal({ seed: 300, starter: 1 }));
    state = call(state, { type: "pass" });
    state = call(state, { type: "pass" });

    expect(state.phase).toBe("complete");
    expect(state.passedOut).toBe(true);
    expect(state.contract).toBeNull();
  });

  it("requires following suit when able", () => {
    let state = completeDraw(startDeal({ seed: 400, starter: 0 }));
    state = call(state, { type: "bid", bid: { level: 1, strain: "S" } });
    state = call(state, { type: "pass" });

    const lead = state.hands[1]![0]!;
    state = applyAction(state, 1, { type: "play", card: lead });

    const responder = state.hands[0]!;
    if (hasSuit(responder, lead.suit)) {
      const offSuit = responder.find((card) => card.suit !== lead.suit);
      expect(legalPlays(state, 0).every((card) => card.suit === lead.suit)).toBe(true);
      if (offSuit !== undefined) {
        expect(() => applyAction(state, 0, { type: "play", card: offSuit })).toThrow();
      }
    } else {
      expect(legalPlays(state, 0)).toHaveLength(responder.length);
    }
  });

  it("gives the lead to the winner of each trick", () => {
    let state = completeDraw(startDeal({ seed: 500, starter: 0 }));
    state = call(state, { type: "bid", bid: { level: 1, strain: "C" } });
    state = call(state, { type: "pass" });

    state = applyAction(state, state.toAct, {
      type: "play",
      card: legalPlays(state, state.toAct)[0]!,
    });
    state = applyAction(state, state.toAct, {
      type: "play",
      card: legalPlays(state, state.toAct)[0]!,
    });

    const trick = state.completedTricks[0]!;
    expect(state.trickLeader).toBe(trick.winner);
    expect(state.toAct).toBe(trick.winner);
  });
});

describe("player view", () => {
  it("never exposes the opponent's hand, the stock or any discards", () => {
    const state = completeDraw(startDeal({ seed: 600, starter: 0 }));
    const view = viewFor(state, 0);
    const serialized = JSON.stringify(view);

    for (const card of state.hands[1]) {
      expect(view.hand.some((held) => cardId(held) === cardId(card))).toBe(false);
    }
    // Every card either seat threw away, looked for as a card rather than by
    // field name: the projection is checked for the cards themselves, so a field
    // added later that happened to carry one would still be caught.
    for (const card of [...state.discards[0], ...state.discards[1]]) {
      expect(serialized).not.toContain(JSON.stringify(card));
    }
    expect(serialized).not.toContain("stock\"");
    expect(view.handSizes).toEqual([13, 13]);
  });

  it("withholds a player's own discards, since the app does not show them", () => {
    const state = completeDraw(startDeal({ seed: 601, starter: 0 }));
    const view = viewFor(state, 0);

    expect(Object.keys(view)).not.toContain("discards");
    expect(view.hand).toHaveLength(13);
  });

  it("reveals the pending card only to the player deciding on it", () => {
    const state = startDeal({ seed: 700, starter: 0 });

    expect(viewFor(state, 0).pending).not.toBeNull();
    expect(viewFor(state, 1).pending).toBeNull();
  });

  it("publishes each player's draw choices to both players", () => {
    let state = startDeal({ seed: 800, starter: 0 });
    state = applyAction(state, 0, { type: "draw-decide", take: "second" });

    expect(viewFor(state, 1).drawTurns).toEqual([{ by: 0, choice: "took-second" }]);
  });

  it("counts the stock down two cards per turn", () => {
    let state = startDeal({ seed: 900, starter: 0 });
    expect(viewFor(state, 0).stockRemaining).toBe(52);

    state = applyAction(state, 0, { type: "draw-decide", take: "first" });
    expect(viewFor(state, 1).stockRemaining).toBe(50);
  });
});

describe("hand display order", () => {
  it("alternates black and red suits so the joins between them are visible", () => {
    const hand = [
      { rank: 3, suit: "D" },
      { rank: 14, suit: "C" },
      { rank: 7, suit: "H" },
      { rank: 2, suit: "S" },
    ] as const;

    expect(sortHand(hand).map(cardId)).toEqual(["2S", "7H", "AC", "3D"]);
  });

  it("orders a suit from the top down", () => {
    const hand = [
      { rank: 5, suit: "H" },
      { rank: 14, suit: "H" },
      { rank: 11, suit: "H" },
    ] as const;

    expect(sortHand(hand).map(cardId)).toEqual(["AH", "JH", "5H"]);
  });

  it("leaves the bidding order alone, where clubs are still the cheapest suit", () => {
    expect(outranks({ level: 1, strain: "D" }, { level: 1, strain: "C" })).toBe(true);
    expect(outranks({ level: 1, strain: "S" }, { level: 1, strain: "H" })).toBe(true);
  });
});

describe("legality from a player view alone", () => {
  it("agrees with the privileged view throughout a whole deal", () => {
    let state = startDeal({ seed: 4242, starter: 0 });

    while (state.phase !== "complete") {
      const player = state.toAct;
      const fromState = legalActions(state, player);
      const fromView = legalActionsForView(viewFor(state, player));

      expect(fromView).toEqual(fromState);
      expect(legalActionsForView(viewFor(state, opponentOf(player)))).toEqual([]);

      state = applyAction(state, player, fromState[0]!);
    }
  });

  it("offers keep and reject to the player holding the pending card", () => {
    const state = startDeal({ seed: 21, starter: 1 });

    expect(legalActionsForView(viewFor(state, 1))).toEqual([
      { type: "draw-decide", take: "first" },
      { type: "draw-decide", take: "second" },
    ]);
    expect(legalActionsForView(viewFor(state, 0))).toEqual([]);
  });

  it("restricts play to the suit led when the viewer can follow", () => {
    let state = completeDraw(startDeal({ seed: 616, starter: 0 }));
    state = call(state, { type: "bid", bid: { level: 1, strain: "NT" } });
    state = call(state, { type: "pass" });

    const leader = state.toAct;
    state = applyAction(state, leader, { type: "play", card: legalPlays(state, leader)[0]! });

    const follower = state.toAct;
    const led = state.currentTrick[0]!.card.suit;
    const view = viewFor(state, follower);
    // A legal claim is offered alongside every playable card and has no card
    // of its own — filtered out here since this test is only about follow-suit.
    const cards = legalActionsForView(view)
      .filter((action) => action.type === "play")
      .map((action) => action.card);

    if (hasSuit(view.hand, led)) {
      expect(cards.every((card) => card.suit === led)).toBe(true);
    } else {
      expect(cards).toHaveLength(view.hand.length);
    }
  });

  it("offers nothing once the deal is complete", () => {
    let state = completeDraw(startDeal({ seed: 77, starter: 0 }));
    state = call(state, { type: "pass" });
    state = call(state, { type: "pass" });

    expect(state.phase).toBe("complete");
    expect(legalActionsForView(viewFor(state, 0))).toEqual([]);
    expect(legalActionsForView(viewFor(state, 1))).toEqual([]);
  });
});
