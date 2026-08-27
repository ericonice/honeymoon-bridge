import {
  actOn,
  cardId,
  dealOf,
  legalActionsForView,
  nextIn,
  opponentOf,
  startMatch,
  summarizeMatch,
  viewFor,
} from "@hb/engine";
import type { Card, DealAction, MatchState, PlayerId } from "@hb/engine";
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
function forbiddenFor(table: MatchState, seat: PlayerId): Set<string> {
  const deal = dealOf(table);
  const them = opponentOf(seat);
  const mine = deal.discards[seat];
  const theirCardOne = deal.pending !== null && deal.toAct !== seat ? [deal.pending] : [];

  const justDrew = deal.drawTurns[deal.drawTurns.length - 1]?.by === seat;
  const spent = deal.lastDraws[seat]?.discarded.length ?? 1;
  const ownDiscards = justDrew ? mine.slice(0, Math.max(0, mine.length - spent)) : mine;

  return new Set(
    [
      ...deal.hands[them],
      ...deal.stock,
      ...theirCardOne,
      ...deal.discards[them],
      ...ownDiscards,
    ].map(cardId),
  );
}

/** A draw phase run out `turns` deep, both seats keeping card 1 every time. */
function drawnOut(turns: number): MatchState {
  let table = rubberFrom(11);
  for (let turn = 0; turn < turns; turn++) {
    table = actOn(table, dealOf(table).toAct, { type: "draw-decide", take: "first" });
  }
  return table;
}

/** A rubber, which is what a table plays. `firstBoard` is a session's business. */
function rubberFrom(seed: number): MatchState {
  return startMatch({ firstBoard: 1, format: "rubber", seed, starter: 0 });
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
function step(table: MatchState): MatchState {
  const deal = dealOf(table);
  const seat = deal.toAct;
  const actions: DealAction[] = legalActionsForView(viewFor(deal, seat));
  const ordinary = actions.filter((action) => action.type !== "claim");
  return actOn(table, seat, (ordinary[ordinary.length - 1] ?? actions[0])!);
}

describe("what a seat is sent", () => {
  it("never holds a card that seat may not see, at any point in a rubber", () => {
    let table = rubberFrom(4242);

    for (let move = 0; move < 900; move++) {
      for (const seat of [0, 1] as PlayerId[]) {
        const forbidden = forbiddenFor(table, seat);
        const leaked = cardsWithin(snapshotFor(table, seat))
          .map(cardId)
          .filter((id) => forbidden.has(id));

        expect(leaked, `seat ${seat} was sent ${leaked.join(", ")}`).toEqual([]);
      }

      table = dealOf(table).phase === "complete" ? nextIn(table, move + 1) : step(table);
    }
  });

  it("does send a seat its own hand, so the test above is not vacuous", () => {
    let table = rubberFrom(9);
    for (let move = 0; move < 30; move++) {
      table = step(table);
    }

    const snapshot = snapshotFor(table, 0);
    const sent = new Set(cardsWithin(snapshot).map(cardId));

    expect(dealOf(table).hands[0].length).toBeGreaterThan(0);
    for (const card of dealOf(table).hands[0]) {
      expect(sent.has(cardId(card))).toBe(true);
    }
  });

  it("shows a seat the card it just threw away, and nothing older", () => {
    // An odd number of turns, so seat 0's own turn is the one that just
    // resolved and its reveal is the one still on screen.
    let table = drawnOut(7);

    const discards = dealOf(table).discards[0];
    const sent = new Set(cardsWithin(snapshotFor(table, 0)).map(cardId));

    expect(discards.length).toBeGreaterThan(1);
    expect(sent.has(cardId(discards[discards.length - 1]!))).toBe(true);
    for (const older of discards.slice(0, -1)) {
      expect(sent.has(cardId(older))).toBe(false);
    }
  });

  it("stops sending that card as soon as the opponent has drawn", () => {
    const mine = drawnOut(7);
    const thrown = dealOf(mine).discards[0][dealOf(mine).discards[0].length - 1]!;
    const theirs = actOn(mine, dealOf(mine).toAct, { type: "draw-decide", take: "first" });

    const sent = new Set(cardsWithin(snapshotFor(theirs, 0)).map(cardId));
    expect(sent.has(cardId(thrown))).toBe(false);
  });

  it("names neither of the opponent's cards on their draw turn, only the choice", () => {
    let table = startMatch({ firstBoard: 1, format: "rubber", seed: 21, starter: 1 });
    table = actOn(table, 1, { type: "draw-decide", take: "second" });

    const seen = snapshotFor(table, 0).lastDraw!;
    expect(seen.by).toBe(1);
    expect(seen.choice).toBe("took-second");
    expect(seen.taken).toBeNull();
    expect(seen.discarded).toEqual([]);
  });

  it("survives a round trip through JSON, since that is how it travels", () => {
    let table = rubberFrom(5);
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
  function intoPlay(seed: number): MatchState {
    let table = rubberFrom(seed);
    while (dealOf(table).phase !== "play") {
      table = step(table);
    }
    return table;
  }

  it("reveals the claimant's hand to the opponent's snapshot, and only there", () => {
    let table = intoPlay(30);
    const claimant = dealOf(table).toAct;
    const opponent = opponentOf(claimant);

    table = actOn(table, claimant, { type: "claim" });

    const opponentSnapshot = snapshotFor(table, opponent);
    expect(opponentSnapshot.view.claim).toBe(claimant);
    expect(opponentSnapshot.view.revealedHand).toEqual({
      by: claimant,
      cards: dealOf(table).hands[claimant],
    });

    // Nothing else leaks alongside it — the revealed hand is the only thing
    // this adds on top of what was already allowed.
    const forbidden = forbiddenFor(table, opponent);
    for (const card of dealOf(table).hands[claimant]) {
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
    const claimant = dealOf(table).toAct;
    const opponent = opponentOf(claimant);

    table = actOn(table, claimant, { type: "claim" });
    table = actOn(table, opponent, { type: "claim-response", accept: false });

    expect(snapshotFor(table, opponent).view.revealedHand).toEqual({
      by: claimant,
      cards: dealOf(table).hands[claimant],
    });

    const next = nextIn(table, 999);
    expect(snapshotFor(next, opponent).view.revealedHand).toBeNull();
  });

  it("completes the deal on acceptance, with nothing left to hide", () => {
    let table = intoPlay(32);
    const claimant = dealOf(table).toAct;
    const opponent = opponentOf(claimant);

    table = actOn(table, claimant, { type: "claim" });
    table = actOn(table, opponent, { type: "claim-response", accept: true });

    expect(dealOf(table).phase).toBe("complete");
    expect(() => snapshotFor(table, claimant)).not.toThrow();
    expect(() => snapshotFor(table, opponent)).not.toThrow();
  });
});

/**
 * **A seed is worse than a card, and the walker above cannot see one.**
 *
 * Duplicate introduced a number that must never cross the wire.
 * `DuplicateState.boards` holds the seed each board is dealt from, and one of those
 * reconstructs an entire deal's stock order — every card either player will be
 * offered, in order, for a board that may not have been played yet. That is not a
 * leak of thirteen cards but of a whole future deal.
 *
 * `cardsWithin` walks for `{ rank, suit }` and a seed is an integer, so it is
 * structurally blind to this. These check the numbers instead: no value anywhere in
 * the serialized snapshot may equal a board's seed, and the standing must be the
 * *summary* rather than the state — a board there is an index and a margin.
 */
describe("what a session may not send", () => {
  /** Every number anywhere in a structure, however deeply buried. */
  function numbersWithin(value: unknown, found: number[] = []): number[] {
    if (typeof value === "number") {
      found.push(value);
      return found;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        numbersWithin(item, found);
      }
      return found;
    }
    if (value === null || typeof value !== "object") {
      return found;
    }
    for (const nested of Object.values(value as Record<string, unknown>)) {
      numbersWithin(nested, found);
    }
    return found;
  }

  function session(): MatchState {
    // Board numbers well clear of anything a score, a trick count or a level could
    // coincidentally be, so a hit is a real hit rather than a collision.
    return startMatch({ boards: 3, firstBoard: 700_001, format: "duplicate", seed: 5, starter: 0 });
  }

  it("never sends a board's seed, at any point in a session", () => {
    let match = session();
    const seeds = new Set(
      match.kind === "duplicate" ? match.session.boards.map((board) => board.seed) : [],
    );
    expect(seeds.size).toBe(3);

    for (let move = 0; move < 1500; move++) {
      for (const seat of [0, 1] as PlayerId[]) {
        const sent = numbersWithin(JSON.parse(JSON.stringify(snapshotFor(match, seat))) as unknown);
        const leaked = sent.filter((value) => seeds.has(value));
        expect(leaked, `seat ${seat} was sent seed ${leaked.join(", ")}`).toEqual([]);
      }

      if (summarizeMatch(match).complete) {
        break;
      }
      match = dealOf(match).phase === "complete" ? nextIn(match, move + 1) : step(match);
    }
  });

  /** The anti-vacuity half: the walker really does find a seed when one is there. */
  it("would notice a seed, so the test above is not passing for free", () => {
    const match = session();
    const seed = match.kind === "duplicate" ? match.session.boards[0]!.seed : 0;
    const sent = numbersWithin({ deep: [{ nested: { seed } }] });

    expect(sent).toContain(seed);
  });

  it("sends a session's standing as a summary rather than as its state", () => {
    const standing = snapshotFor(session(), 0).standing;

    expect(standing.kind).toBe("duplicate");
    if (standing.kind === "duplicate") {
      // Indices and margins, not seeds.
      expect(standing.summary.boards.map((board) => board.board)).toEqual([0, 1, 2]);
      expect(Object.keys(standing.summary)).not.toContain("boards.seed");
    }
    expect(JSON.stringify(standing)).not.toContain("seed");
  });
});
