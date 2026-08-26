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
  /** Card 1, face up and awaiting the decision. */
  readonly first: Card;
  readonly hand: readonly Card[];
  /** What this seat has thrown away and therefore looked at. */
  readonly remembered: readonly Card[];
}

/**
 * Which of the two cards on offer to take into the hand.
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
 */
/**
 * A cheap "would this hand keep that card" test, for asking it many times.
 *
 * `chooseTake` answers the same question but recomputes the expected value of an
 * unknown card for every candidate — a fresh deck and forty `gainFrom` calls each
 * time — when that expectation depends only on the hand. For one decision that
 * does not matter. For `drawSimulation.ts`, which asks about every card in the
 * pool on every one of thirteen turns, it was **55ms a sample**: enough to cut the
 * bid search from twelve samples inside its deadline to five, which made a better
 * sampler produce a worse estimate.
 *
 * So the expectation is computed once and handed back as a closure. The one
 * approximation is that the unknown pool here does not exclude the candidate
 * itself, which is a card in thirty-nine.
 */
export function keepTest(
  hand: readonly Card[],
  remembered: readonly Card[],
  defenseShare = DEFENSE_SHARE,
): (card: Card) => boolean {
  const base = rawHandValue(hand, true, defenseShare);
  const pool = unseenPool(hand, [], remembered);
  const expected =
    pool.length === 0
      ? -Infinity
      : pool.reduce((sum, unseen) => sum + gainFrom(hand, base, unseen, defenseShare), 0) /
        pool.length;
  return (card: Card): boolean => gainFrom(hand, base, card, defenseShare) >= expected;
}

export function chooseTake({
  defenseShare = DEFENSE_SHARE,
  first,
  hand,
  remembered,
}: DrawOptions): DrawTake {
  // Valued as a hand still being dealt: the finished-hand honor rules would
  // call a lone king bare when it has twelve turns left to be joined.
  const base = rawHandValue(hand, true, defenseShare);
  const keeping = gainFrom(hand, base, first, defenseShare);

  const pool = unseenPool(hand, [first], remembered);
  const expected =
    pool.length === 0
      ? -Infinity
      : pool.reduce((sum, unseen) => sum + gainFrom(hand, base, unseen, defenseShare), 0) /
        pool.length;

  return keeping >= expected ? "first" : "second";
}

/**
 * Whether to keep card 1, or reject it and take card 2 sight-unseen.
 *
 * The same decision as a boolean, which is the shape `bench/draw.ts` and the draw
 * tests ask it in — expressed through `chooseTake` rather than beside it, so there
 * is one valuation to be wrong.
 */
export function shouldKeepCard(
  hand: readonly Card[],
  card: Card,
  remembered: readonly Card[] = [],
): boolean {
  return chooseTake({ first: card, hand, remembered }) === "first";
}
