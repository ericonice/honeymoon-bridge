import {
  applyTableAction,
  cardId,
  legalActionsForView,
  nextDeal,
  opponentOf,
  startTable,
  viewFor,
} from "@hb/engine";
import type { Card, DealAction, PlayerId, TableState } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { snapshotFor } from "../src/snapshot.js";

/**
 * Every card-shaped value anywhere in a structure, however deeply buried.
 *
 * Deliberately blind to the snapshot's shape: a field added later is walked
 * without anyone remembering to update this, which is the only way a leak test
 * stays honest as the protocol grows.
 */
function cardsWithin(value: unknown, found: Card[] = []): Card[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      cardsWithin(item, found);
    }
    return found;
  }
  if (value === null || typeof value !== "object") {
    return found;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.rank === "number" && typeof record.suit === "string") {
    found.push(record as unknown as Card);
  }
  for (const nested of Object.values(record)) {
    cardsWithin(nested, found);
  }
  return found;
}

/**
 * Cards this seat has no right to see.
 *
 * Its own discards are permitted only as far as the most recent one: §1.4 shows
 * that card back for a single turn and no further, so everything before it is
 * as forbidden as the opponent's.
 *
 * Card 1 is the exception that proves the rule — it is face up to whoever is
 * deciding on it and face down to everyone else, so it is forbidden here only
 * when the turn belongs to the other seat.
 */
function forbiddenFor(table: TableState, seat: PlayerId): Set<string> {
  const { deal } = table;
  const them = opponentOf(seat);
  const mine = deal.discards[seat];
  const theirCardOne = deal.pending !== null && deal.toAct !== seat ? [deal.pending] : [];

  return new Set(
    [
      ...deal.hands[them],
      ...deal.stock,
      ...theirCardOne,
      ...deal.discards[them],
      ...mine.slice(0, Math.max(0, mine.length - 1)),
    ].map(cardId),
  );
}

/** Drives the table with whatever is legal, so every phase gets inspected. */
function step(table: TableState): TableState {
  const seat = table.deal.toAct;
  const actions: DealAction[] = legalActionsForView(viewFor(table.deal, seat));
  return applyTableAction(table, seat, actions[actions.length - 1]!);
}

describe("what a seat is sent", () => {
  it("never holds a card that seat may not see, at any point in a rubber", () => {
    let table = startTable({ seed: 4242, starter: 0 });

    for (let move = 0; move < 900; move++) {
      for (const seat of [0, 1] as PlayerId[]) {
        const forbidden = forbiddenFor(table, seat);
        const leaked = cardsWithin(snapshotFor(table, seat))
          .map(cardId)
          .filter((id) => forbidden.has(id));

        expect(leaked, `seat ${seat} was sent ${leaked.join(", ")}`).toEqual([]);
      }

      table = table.deal.phase === "complete" ? nextDeal(table, move + 1) : step(table);
    }
  });

  it("does send a seat its own hand, so the test above is not vacuous", () => {
    let table = startTable({ seed: 9, starter: 0 });
    for (let move = 0; move < 30; move++) {
      table = step(table);
    }

    const snapshot = snapshotFor(table, 0);
    const sent = new Set(cardsWithin(snapshot).map(cardId));

    expect(table.deal.hands[0].length).toBeGreaterThan(0);
    for (const card of table.deal.hands[0]) {
      expect(sent.has(cardId(card))).toBe(true);
    }
  });

  it("shows a seat the card it just threw away, and nothing older", () => {
    let table = startTable({ seed: 11, starter: 0 });
    // Four turns each, so there is a discard history to get wrong.
    for (let move = 0; move < 8; move++) {
      table = applyTableAction(table, table.deal.toAct, { type: "draw-decide", keep: true });
    }

    const discards = table.deal.discards[0];
    const sent = new Set(cardsWithin(snapshotFor(table, 0)).map(cardId));

    expect(discards.length).toBeGreaterThan(1);
    expect(sent.has(cardId(discards[discards.length - 1]!))).toBe(true);
    for (const older of discards.slice(0, -1)) {
      expect(sent.has(cardId(older))).toBe(false);
    }
  });

  it("names neither of the opponent's cards on their draw turn, only the choice", () => {
    let table = startTable({ seed: 21, starter: 1 });
    table = applyTableAction(table, 1, { type: "draw-decide", keep: false });

    const seen = snapshotFor(table, 0).lastDraw!;
    expect(seen.by).toBe(1);
    expect(seen.choice).toBe("took-second");
    expect(seen.taken).toBeNull();
    expect(seen.discarded).toBeNull();
  });

  it("survives a round trip through JSON, since that is how it travels", () => {
    let table = startTable({ seed: 5, starter: 0 });
    for (let move = 0; move < 40; move++) {
      table = step(table);
    }

    const snapshot = snapshotFor(table, 0);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
