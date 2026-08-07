import { buildDeck, cardId } from "@hb/engine";
import type { Card } from "@hb/engine";
import { rawHandValue } from "./evaluate.js";

/**
 * Every card that could still turn up, from the point of view of a player who
 * remembers only what is in their hand.
 *
 * This is deliberately naive. A player who recalled their own discards would
 * rule those out too, and a better pool would make sharper decisions — which is
 * exactly the difficulty lever REQUIREMENTS §2.1 describes. Memory belongs here,
 * as a smaller pool, rather than anywhere else in the bot.
 */
function unseenPool(hand: readonly Card[], rejected: Card): Card[] {
  const seen = new Set(hand.map(cardId));
  // Card 1 is discarded when it is rejected, so it cannot also be card 2.
  seen.add(cardId(rejected));
  return buildDeck().filter((card) => !seen.has(cardId(card)));
}

/** What adding this card would do for the hand. */
function gainFrom(hand: readonly Card[], base: number, card: Card): number {
  return rawHandValue([...hand, card], true) - base;
}

/**
 * Whether to keep card 1, or reject it and take card 2 sight-unseen.
 *
 * The question is not "is this a good card" but "is it better than the average
 * card I have not seen" — rejecting is not throwing the card away, it is
 * swapping it for a draw from what is left. So both sides are measured the same
 * way: what card 1 adds to this hand, against what an unknown card adds on
 * average.
 *
 * Measuring the gain against the hand, rather than scoring the card on its own,
 * is what makes the obvious things fall out without being special-cased. An ace
 * is worth having anywhere. A fifth card in a suit you are already long in is
 * worth more than a fifth in a suit you are not, because length only pays once
 * it is past the trumps you expect to lose. And two long suits beat one, since
 * a hand's worth is taken at its best strain and no-trump counts the length of
 * every suit at once.
 *
 * Ties keep. The values are coarse enough that ties are common, and a card in
 * the hand is worth an unknown one of the same expectation.
 */
export function shouldKeepCard(hand: readonly Card[], card: Card): boolean {
  // Valued as a hand still being dealt: the finished-hand honour rules would
  // call a lone king bare when it has twelve turns left to be joined.
  const base = rawHandValue(hand, true);
  const keeping = gainFrom(hand, base, card);

  const pool = unseenPool(hand, card);
  if (pool.length === 0) {
    return true;
  }
  const expected = pool.reduce((sum, unseen) => sum + gainFrom(hand, base, unseen), 0) / pool.length;

  return keeping >= expected;
}
