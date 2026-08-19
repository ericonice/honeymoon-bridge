import { buildDeck, cardId } from "@hb/engine";
import type { Card, DrawTake } from "@hb/engine";
import { DEFENSE_SHARE, rawHandValue } from "./evaluate.js";

/**
 * Every card that could still turn up, given what this player remembers seeing.
 *
 * `remembered` is the cards it threw away and therefore looked at. Leaving them
 * in the pool is not merely blurry, it is **biased**: they are precisely the
 * cards this bot judged worse than an unknown one, so a pool containing them
 * values an unknown card lower than it should and the bot keeps too often. The
 * effect grows through the phase as the discards pile up.
 *
 * Which is why memory is a bias correction before it is a difficulty lever.
 * Handing over fewer remembered cards still makes a weaker, more human opponent
 * — that part of §2.1 stands — but the bot with none was not neutral, it was
 * wrong in a particular direction.
 */
function unseenPool(
  hand: readonly Card[],
  accounted: readonly (Card | null)[],
  remembered: readonly Card[],
): Card[] {
  const seen = new Set(hand.map(cardId));
  // Card 1 cannot also be card 2, and neither can a card lying on the discard
  // pile — both are out of the stock already.
  for (const card of [...accounted, ...remembered]) {
    if (card !== null) {
      seen.add(cardId(card));
    }
  }
  return buildDeck().filter((card) => !seen.has(cardId(card)));
}

/** What adding this card would do for the hand. */
function gainFrom(
  hand: readonly Card[],
  base: number,
  card: Card,
  defenseShare: number,
): number {
  return rawHandValue([...hand, card], true, defenseShare) - base;
}

export interface DrawOptions {
  /**
   * How much of a growing hand's worth comes from defending — see `DEFENSE_SHARE`.
   * A parameter rather than a constant read here so `bench/draw.ts` can pit two
   * weights against each other in one process; nothing in the app passes it.
   */
  readonly defenseShare?: number;
  /**
   * The face-up top of the discard pile, or null when there is nothing on offer
   * — every turn under the base rules, and the first turn under `openDiscard`.
   */
  readonly discardTop: Card | null;
  /** Card 1, face up and awaiting the decision. */
  readonly first: Card;
  readonly hand: readonly Card[];
  /** What this seat has thrown away and therefore looked at. */
  readonly remembered: readonly Card[];
}

/**
 * Which of the cards on offer to take into the hand.
 *
 * The question is never "is this a good card" but "is it better than the average
 * card I have not seen" — rejecting card 1 is not throwing it away, it is
 * swapping it for a draw from what is left. So every option is measured the same
 * way: what it adds to this hand, with the unknown card priced at what it adds on
 * average across everything that could still turn up.
 *
 * Measuring the gain against the hand, rather than scoring the card on its own,
 * is what makes the obvious things fall out without being special-cased. An ace
 * is worth having anywhere. A fifth card in a suit you are already long in is
 * worth more than a fifth in a suit you are not, because length only pays once
 * it is past the trumps you expect to lose. And two long suits beat one, since
 * a hand's worth is taken at its best strain and no-trump counts the length of
 * every suit at once.
 *
 * Ties go to a card that can be seen, and among those to card 1. The values are
 * coarse enough that ties are common, and a card in the hand is worth an unknown
 * one of the same expectation.
 *
 * **What this deliberately does not price: the gift.** Under `openDiscard` the
 * card this turn throws is a card the opponent may pick up, so rejecting a good
 * card is not free — and only one of the three choices has a priceable cost,
 * since the other two hand over a card 2 this decision has not seen. Weighting
 * that would be a constant nothing here has measured, and `bench/draw.ts` pits
 * policies against each other for exactly this reason. Left unpriced until it is.
 */
export function chooseTake({
  defenseShare = DEFENSE_SHARE,
  discardTop,
  first,
  hand,
  remembered,
}: DrawOptions): DrawTake {
  // Valued as a hand still being dealt: the finished-hand honor rules would
  // call a lone king bare when it has twelve turns left to be joined.
  const base = rawHandValue(hand, true, defenseShare);
  const keeping = gainFrom(hand, base, first, defenseShare);

  const pool = unseenPool(hand, [first, discardTop], remembered);
  const expected =
    pool.length === 0
      ? -Infinity
      : pool.reduce((sum, unseen) => sum + gainFrom(hand, base, unseen, defenseShare), 0) /
        pool.length;
  const offered =
    discardTop === null ? -Infinity : gainFrom(hand, base, discardTop, defenseShare);

  if (keeping >= offered && keeping >= expected) {
    return "first";
  }
  return offered >= expected ? "discard" : "second";
}

/**
 * Whether to keep card 1, or reject it and take card 2 sight-unseen.
 *
 * The base game's two-way form of the decision above, kept because it is the
 * question `bench/draw.ts` and the draw tests ask — and expressed through the
 * same arithmetic rather than beside it, so there is one valuation to be wrong.
 */
export function shouldKeepCard(
  hand: readonly Card[],
  card: Card,
  remembered: readonly Card[] = [],
): boolean {
  return chooseTake({ discardTop: null, first: card, hand, remembered }) === "first";
}
