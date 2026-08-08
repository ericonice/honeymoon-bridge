import { describe, expect, it } from "vitest";
import { applyAction } from "../src/deal.js";
import { applyTableAction, nextDeal, startTable, summarise } from "../src/table.js";
import { drawRevealFor, ownDrawPairFor, revealsUnseenCard } from "../src/view.js";
import { cardId } from "../src/cards.js";
import type { TableState } from "../src/table.js";
import type { Call, PlayerId } from "../src/types.js";

/** Drives the current deal to completion, always taking the first legal option. */
function completeDeal(table: TableState, contract: Call): TableState {
  let current = table;
  while (current.deal.phase === "draw") {
    current = applyTableAction(current, current.deal.toAct, {
      type: "draw-decide",
      keep: true,
    });
  }
  current = applyTableAction(current, current.deal.toAct, { type: "call", call: contract });
  current = applyTableAction(current, current.deal.toAct, {
    type: "call",
    call: { type: "pass" },
  });

  while (current.deal.phase === "play") {
    const hand = current.deal.hands[current.deal.toAct];
    const led = current.deal.currentTrick[0];
    const legal =
      led === undefined
        ? hand
        : hand.some((card) => card.suit === led.card.suit)
          ? hand.filter((card) => card.suit === led.card.suit)
          : hand;
    current = applyTableAction(current, current.deal.toAct, { type: "play", card: legal[0]! });
  }
  return current;
}

describe("the table", () => {
  it("starts with an empty scorepad and nobody vulnerable", () => {
    const summary = summarise(startTable({ seed: 1, starter: 0 }));

    expect(summary.history).toEqual([]);
    expect(summary.vulnerable).toEqual([false, false]);
    expect(summary.rubber.gamesWon).toEqual([0, 0]);
    expect(summary.score).toBeNull();
  });

  it("derives the deal's score rather than accumulating it", () => {
    const table = completeDeal(startTable({ seed: 2024, starter: 0 }), {
      type: "bid",
      bid: { level: 1, strain: "S" },
    });

    // Summarising repeatedly must not fold the same deal into the rubber twice.
    const once = summarise(table);
    const twice = summarise(table);
    const thrice = summarise(table);

    expect(twice.rubber).toEqual(once.rubber);
    expect(thrice.rubber).toEqual(once.rubber);
    expect(twice.history).toHaveLength(once.history.length);
  });

  it("is a rubber unless asked for otherwise", () => {
    expect(startTable({ seed: 1, starter: 0 }).rubberBefore.format).toBe("rubber");
    expect(startTable({ format: "game", seed: 1, starter: 0 }).rubberBefore.format).toBe("game");
  });

  it("keeps the match format when the next deal is dealt", () => {
    // Whether this deal won the game or not, the format has to survive: on one
    // branch it is carried with the rubber, on the other a fresh match is
    // started and has to be started as the same kind.
    const table = completeDeal(startTable({ format: "game", seed: 2024, starter: 0 }), {
      type: "bid",
      bid: { level: 1, strain: "S" },
    });
    expect(summarise(table).rubber.format).toBe("game");
    expect(nextDeal(table, 99).rubberBefore.format).toBe("game");
  });

  it("commits the finished deal to the scorepad when the next one is dealt", () => {
    const first = completeDeal(startTable({ seed: 2024, starter: 0 }), {
      type: "bid",
      bid: { level: 1, strain: "S" },
    });
    expect(first.played).toHaveLength(0);
    expect(summarise(first).history).toHaveLength(1);

    const second = nextDeal(first, 99);
    expect(second.played).toHaveLength(1);
    expect(second.deal.phase).toBe("draw");
  });

  it("alternates who draws first, and redeals a passed-out deal to the same player", () => {
    let table = startTable({ seed: 7, starter: 0 });
    while (table.deal.phase === "draw") {
      table = applyTableAction(table, table.deal.toAct, { type: "draw-decide", keep: true });
    }
    table = applyTableAction(table, table.deal.toAct, { type: "call", call: { type: "pass" } });
    table = applyTableAction(table, table.deal.toAct, { type: "call", call: { type: "pass" } });

    expect(table.deal.passedOut).toBe(true);
    expect(nextDeal(table, 8).deal.starter).toBe(0);

    const played = completeDeal(startTable({ seed: 2024, starter: 0 }), {
      type: "bid",
      bid: { level: 1, strain: "S" },
    });
    expect(nextDeal(played, 8).deal.starter).toBe(1);
  });

  it("carries the rubber forward and wipes it when one is won", () => {
    let table = startTable({ seed: 11, starter: 0 });
    let guard = 0;

    while (!summarise(table).rubber.complete && guard < 60) {
      table = completeDeal(table, { type: "bid", bid: { level: 7, strain: "NT" } });
      const summary = summarise(table);
      // The scorepad grows by one every deal, however the deal went.
      expect(summary.history).toHaveLength(table.played.length + 1);
      if (!summary.rubber.complete) {
        table = nextDeal(table, guard + 500);
      }
      guard++;
    }

    const won = summarise(table);
    if (won.rubber.complete) {
      // Starting again clears the scorepad rather than carrying it over.
      expect(nextDeal(table, 1).played).toEqual([]);
      expect(nextDeal(table, 1).rubberBefore.gamesWon).toEqual([0, 0]);
    }
  });
});

describe("what a resolved draw turn shows each seat", () => {
  it("names both of your own cards and neither of theirs", () => {
    const table = startTable({ seed: 4, starter: 0 });
    const cardOne = table.deal.pending!;
    const cardTwo = table.deal.stock[0]!;

    const after = applyAction(table.deal, 0, { type: "draw-decide", keep: true });

    const mine = drawRevealFor(after, 0)!;
    expect(cardId(mine.taken!)).toBe(cardId(cardOne));
    expect(cardId(mine.discarded!)).toBe(cardId(cardTwo));

    const theirs = drawRevealFor(after, 1)!;
    expect(theirs.taken).toBeNull();
    expect(theirs.discarded).toBeNull();
    // The choice itself is public to both.
    expect(theirs.choice).toBe("kept-first");
    expect(theirs.by).toBe(0);
  });

  it("only holds up a card the seat has not already seen", () => {
    const table = startTable({ seed: 4, starter: 0 });

    const kept = drawRevealFor(applyAction(table.deal, 0, { type: "draw-decide", keep: true }), 0)!;
    expect(revealsUnseenCard(kept)).toBe(true);

    const took = drawRevealFor(applyAction(table.deal, 0, { type: "draw-decide", keep: false }), 0)!;
    expect(revealsUnseenCard(took)).toBe(false);

    // Never for the other seat, whatever they chose.
    const theirs = drawRevealFor(applyAction(table.deal, 0, { type: "draw-decide", keep: true }), 1)!;
    expect(revealsUnseenCard(theirs)).toBe(false);
  });

  it("reaches back to a seat's own last turn regardless of whose turn resolved", () => {
    let state = startTable({ seed: 12, starter: 0 }).deal;
    state = applyAction(state, 0, { type: "draw-decide", keep: true });
    const afterMine = ownDrawPairFor(state, 0)!;

    state = applyAction(state, 1, { type: "draw-decide", keep: true });
    const stillMine = ownDrawPairFor(state, 0)!;

    expect(cardId(stillMine.taken)).toBe(cardId(afterMine.taken));
    expect(cardId(stillMine.discarded)).toBe(cardId(afterMine.discarded));
  });

  it("has nothing to show before the first turn", () => {
    const table = startTable({ seed: 1, starter: 0 });
    for (const seat of [0, 1] as PlayerId[]) {
      expect(drawRevealFor(table.deal, seat)).toBeNull();
      expect(ownDrawPairFor(table.deal, seat)).toBeNull();
    }
  });
});
