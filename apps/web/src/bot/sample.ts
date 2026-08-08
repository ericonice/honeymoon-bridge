import { buildDeck, cardId, shuffle } from "@hb/engine";
import type { Card, PlayerView, Rng, Suit } from "@hb/engine";

/**
 * A guess at the opponent's hand, consistent with everything this seat has seen.
 *
 * The solver needs two hands and a seat only ever has one, so this supplies the
 * other. Half the deck is out of play, which makes the guess much weaker than
 * the equivalent in ordinary bridge — there, every unseen card is in somebody's
 * hand and the deal is fully determined once you guess. Here roughly a third of
 * what could be theirs actually is, and the rest was never dealt. That is
 * precisely why one guess is worthless and an average over many is not.
 *
 * Only one constraint is available without memory: a suit they failed to follow
 * is a suit they hold none of. The pool would shrink further by whatever the bot
 * remembers discarding — that belongs here, as a smaller pool, and nowhere else.
 */

/** Suits the opponent has proved void in by discarding on a lead of that suit. */
export function shownVoids(view: PlayerView): Set<Suit> {
  const voids = new Set<Suit>();

  for (const trick of [...view.completedTricks.map((one) => one.cards), view.currentTrick]) {
    const led = trick[0];
    if (led === undefined) {
      continue;
    }
    for (const played of trick) {
      if (played.by === view.opponent && played.card.suit !== led.card.suit) {
        voids.add(led.card.suit);
      }
    }
  }

  return voids;
}

/**
 * Every card this seat cannot place: not in its hand, not yet played, and not
 * one it threw away itself.
 *
 * That last group is the one worth spelling out. Thirteen cards go face down
 * from this seat's own hand during the draw, and it looked at every one of them.
 * Leaving them in the pool lets the sampler deal the opponent cards it watched
 * itself discard — not a subtle bias but an impossible hand, and by the end of
 * the deal half of what is unaccounted for is exactly those thirteen.
 */
function unaccounted(view: PlayerView, remembered: readonly Card[]): Card[] {
  const placed = new Set([
    ...view.hand.map(cardId),
    ...remembered.map(cardId),
    ...view.completedTricks.flatMap((trick) => trick.cards.map((played) => cardId(played.card))),
    ...view.currentTrick.map((played) => cardId(played.card)),
  ]);
  return buildDeck().filter((card) => !placed.has(cardId(card)));
}

/**
 * How much likelier a card is to be theirs in a suit they bid.
 *
 * The auction is evidence about the hand this seat cannot see, and until now the
 * only evidence being used was the cards already played. That skipped the
 * strongest thing in the deal: with no partner and no conventions, a bid means
 * they are long in that suit and means nothing else.
 *
 * Two rather than a computed share, because the sample only has to lean the
 * right way. Every guess is wrong in detail; what matters is that the guesses
 * are wrong in the same direction the real hand is.
 *
 * Worth 15% of everything the bot throws away — tricks lost against par fall
 * from 1.23 a deal to 1.05, improving declarer and defense by almost exactly the
 * same amount. Measured in *points* the same change reads as slightly harmful
 * (+47.8 against +50.1 a deal), and it is not: points per deal cannot resolve
 * an effect this size at any sample count worth waiting for. Measure card play
 * against par, always.
 */
const BID_WEIGHT = 2;

/** Strains the opponent has named, which are the suits to expect length in. */
function suitsTheyBid(view: PlayerView): Set<Suit> {
  const named = new Set<Suit>();
  for (const entry of view.auction) {
    if (entry.by === view.opponent && entry.call.type === "bid" && entry.call.bid.strain !== "NT") {
      named.add(entry.call.bid.strain);
    }
  }
  return named;
}

/**
 * A weighted draw without replacement, off the seeded generator.
 *
 * Each card races on a key of `-log(u) / weight`, and the lowest keys win, which
 * draws each card in proportion to its weight exactly. Shuffling and taking the
 * first n is the same thing with every weight equal, and this keeps that
 * property when they are not.
 */
function drawWeighted(cards: readonly Card[], size: number, weight: (card: Card) => number, rng: Rng): Card[] {
  return cards
    .map((card) => ({ card, key: -Math.log(1 - rng.next()) / weight(card) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, size)
    .map((entry) => entry.card);
}

export function sampleOpponentHand(
  view: PlayerView,
  rng: Rng,
  remembered: readonly Card[] = [],
): Card[] {
  const size = view.handSizes[view.opponent];
  const pool = unaccounted(view, remembered);
  const voids = shownVoids(view);
  const possible = pool.filter((card) => !voids.has(card.suit));

  // The voids cannot make the pool too small to fill a hand — the cards they
  // are void in are precisely the ones they no longer hold — but a hand that
  // could not be dealt would be worse than an unconstrained guess.
  const drawable = possible.length >= size ? possible : pool;

  const bid = suitsTheyBid(view);
  if (bid.size === 0) {
    return shuffle(drawable, rng).slice(0, size);
  }
  return drawWeighted(drawable, size, (card) => (bid.has(card.suit) ? BID_WEIGHT : 1), rng);
}
