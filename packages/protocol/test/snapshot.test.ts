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
 * Its own discards are permitted in one case only: the card its own last turn
 * threw, and then only while that turn is the one that has just resolved. That
 * is not a concession but a requirement — §1.3 has the card being thrown away
 * shown as it goes, which on a keep is the only sight of card 2 anyone ever
 * gets. The moment the opponent draws, the reveal is over and the card is as
 * forbidden as the twelve behind it.
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

  const justDrew = deal.drawTurns[deal.drawTurns.length - 1]?.by === seat;
  const spent = deal.lastDraws[seat]?.discarded.length ?? 1;
  const ownDiscards = justDrew ? mine.slice(0, Math.max(0, mine.length - spent)) : mine;

  const forbidden = new Set(
    [
      ...deal.hands[them],
      ...deal.stock,
      ...theirCardOne,
      ...deal.discards[them],
      ...ownDiscards,
    ].map(cardId),
  );

  if (deal.rules.openDiscard) {
    // Two cards `openDiscard` moves to the permitted side, and only two. The first
    // is the face-up top of the pile, which both seats can read off the table.
    if (deal.phase === "draw" && deal.discardTop !== null) {
      forbidden.delete(cardId(deal.discardTop.card));
    }
    // The second is the card the opponent has just lifted off that pile — the same
    // card, one turn later, now in their hand. It is permitted on exactly the terms
    // this seat's own last discard is: only while that turn is the one that just
    // resolved, because the reveal naming it is what is on screen. Once this seat
    // draws again it is an ordinary card of theirs and forbidden with the rest.
    const last = deal.drawTurns[deal.drawTurns.length - 1];
    const lifted = deal.lastDraws[them]?.taken;
    if (last?.by === them && last.choice === "took-discard" && lifted !== undefined) {
      forbidden.delete(cardId(lifted));
    }
  }
  return forbidden;
}

/** A draw phase run out `turns` deep, both seats keeping card 1 every time. */
function drawnOut(turns: number): TableState {
  let table = startTable({ seed: 11, starter: 0 });
  for (let turn = 0; turn < turns; turn++) {
    table = applyTableAction(table, table.deal.toAct, { type: "draw-decide", take: "first" });
  }
  return table;
}

/**
 * Drives the table with whatever is legal, so every phase gets inspected.
 *
 * Claim is excluded from what gets picked: it is always the last legal action
 * during play, so a driver that always takes the last one would claim on the
 * very first trick, every single deal, and a rubber's worth of ordinary trick
 * play would never actually run. Claim's own hidden-information behavior gets
 * its own dedicated tests below instead.
 */
function step(table: TableState): TableState {
  const seat = table.deal.toAct;
  const actions: DealAction[] = legalActionsForView(viewFor(table.deal, seat));
  const ordinary = actions.filter((action) => action.type !== "claim");
  return applyTableAction(table, seat, (ordinary[ordinary.length - 1] ?? actions[0])!);
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

  /**
   * The same walker under the variant, which is the only thing in the game that
   * widens what a seat may see. `step` picks the last legal action, and taking
   * the pile is the last one `takesFrom` offers, so this drives the rubber
   * *through* the new move rather than merely alongside it.
   */
  it("holds nothing extra under the open discard bar the card lying face up", () => {
    let table = startTable({ rules: { openDiscard: true }, seed: 4242, starter: 0 });
    let taken = 0;

    for (let move = 0; move < 900; move++) {
      for (const seat of [0, 1] as PlayerId[]) {
        const forbidden = forbiddenFor(table, seat);
        const leaked = cardsWithin(snapshotFor(table, seat))
          .map(cardId)
          .filter((id) => forbidden.has(id));

        expect(leaked, `seat ${seat} was sent ${leaked.join(", ")}`).toEqual([]);
      }

      taken += table.deal.drawTurns[table.deal.drawTurns.length - 1]?.choice === "took-discard" ? 1 : 0;
      table = table.deal.phase === "complete" ? nextDeal(table, move + 1) : step(table);
    }

    // A leak test that never exercised the leaking move would pass for the wrong
    // reason.
    expect(taken).toBeGreaterThan(0);
  });

  it("shows a seat the card it just threw away, and nothing older", () => {
    // An odd number of turns, so seat 0's own turn is the one that just
    // resolved and its reveal is the one still on screen.
    let table = drawnOut(7);

    const discards = table.deal.discards[0];
    const sent = new Set(cardsWithin(snapshotFor(table, 0)).map(cardId));

    expect(discards.length).toBeGreaterThan(1);
    expect(sent.has(cardId(discards[discards.length - 1]!))).toBe(true);
    for (const older of discards.slice(0, -1)) {
      expect(sent.has(cardId(older))).toBe(false);
    }
  });

  it("stops sending that card as soon as the opponent has drawn", () => {
    const mine = drawnOut(7);
    const thrown = mine.deal.discards[0][mine.deal.discards[0].length - 1]!;
    const theirs = applyTableAction(mine, mine.deal.toAct, { type: "draw-decide", take: "first" });

    const sent = new Set(cardsWithin(snapshotFor(theirs, 0)).map(cardId));
    expect(sent.has(cardId(thrown))).toBe(false);
  });

  /**
   * The card they lifted off the open pile is one this seat had been looking at, so
   * the reveal names it — and then stops, on the same terms as this seat's own last
   * discard. A permission that outlived its reveal would be a running list of cards
   * in their hand, which is the thing the whole projection exists to prevent.
   */
  it("names the card they lifted off the pile, and stops once this seat draws again", () => {
    let table = startTable({ rules: { openDiscard: true }, seed: 21, starter: 0 });
    table = applyTableAction(table, 0, { type: "draw-decide", take: "first" });
    const offered = table.deal.discardTop!.card;

    const lifted = applyTableAction(table, 1, { type: "draw-decide", take: "discard" });
    expect(lifted.deal.hands[1].map(cardId)).toContain(cardId(offered));
    expect(cardId(snapshotFor(lifted, 0).lastDraw!.taken!)).toBe(cardId(offered));

    const after = applyTableAction(lifted, 0, { type: "draw-decide", take: "first" });
    const sent = new Set(cardsWithin(snapshotFor(after, 0)).map(cardId));
    expect(sent.has(cardId(offered))).toBe(false);
  });

  it("names neither of the opponent's cards on their draw turn, only the choice", () => {
    let table = startTable({ seed: 21, starter: 1 });
    table = applyTableAction(table, 1, { type: "draw-decide", take: "second" });

    const seen = snapshotFor(table, 0).lastDraw!;
    expect(seen.by).toBe(1);
    expect(seen.choice).toBe("took-second");
    expect(seen.taken).toBeNull();
    expect(seen.discarded).toEqual([]);
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

/**
 * A claim is the one deliberate exception to everything above: the claimant's
 * hand is genuinely sent to the opponent. These tests exist to keep that
 * exception narrow and explicit rather than trusting the generic fuzz test
 * above to notice it — that test never claims at all, on purpose (see `step`).
 */
describe("a claim", () => {
  function intoPlay(seed: number): TableState {
    let table = startTable({ seed, starter: 0 });
    while (table.deal.phase !== "play") {
      table = step(table);
    }
    return table;
  }

  it("reveals the claimant's hand to the opponent's snapshot, and only there", () => {
    let table = intoPlay(30);
    const claimant = table.deal.toAct;
    const opponent = opponentOf(claimant);

    table = applyTableAction(table, claimant, { type: "claim" });

    const opponentSnapshot = snapshotFor(table, opponent);
    expect(opponentSnapshot.view.claim).toBe(claimant);
    expect(opponentSnapshot.view.revealedHand).toEqual({
      by: claimant,
      cards: table.deal.hands[claimant],
    });

    // Nothing else leaks alongside it — the revealed hand is the only thing
    // this adds on top of what was already allowed.
    const forbidden = forbiddenFor(table, opponent);
    for (const card of table.deal.hands[claimant]) {
      forbidden.delete(cardId(card));
    }
    const leaked = cardsWithin(opponentSnapshot)
      .map(cardId)
      .filter((id) => forbidden.has(id));
    expect(leaked).toEqual([]);

    // The claimant's own snapshot gains nothing new — they already have their
    // hand in `view.hand`.
    expect(snapshotFor(table, claimant).view.revealedHand).toBeNull();
  });

  it("keeps the hand visible after a denial, for the rest of this deal only", () => {
    let table = intoPlay(31);
    const claimant = table.deal.toAct;
    const opponent = opponentOf(claimant);

    table = applyTableAction(table, claimant, { type: "claim" });
    table = applyTableAction(table, opponent, { type: "claim-response", accept: false });

    expect(snapshotFor(table, opponent).view.revealedHand).toEqual({
      by: claimant,
      cards: table.deal.hands[claimant],
    });

    const next = nextDeal(table, 999);
    expect(snapshotFor(next, opponent).view.revealedHand).toBeNull();
  });

  it("completes the deal on acceptance, with nothing left to hide", () => {
    let table = intoPlay(32);
    const claimant = table.deal.toAct;
    const opponent = opponentOf(claimant);

    table = applyTableAction(table, claimant, { type: "claim" });
    table = applyTableAction(table, opponent, { type: "claim-response", accept: true });

    expect(table.deal.phase).toBe("complete");
    expect(() => snapshotFor(table, claimant)).not.toThrow();
    expect(() => snapshotFor(table, opponent)).not.toThrow();
  });
});
