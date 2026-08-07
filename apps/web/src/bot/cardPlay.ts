import { SUITS, beats, buildDeck, cardId, playableFrom, trumpSuit } from "@hb/engine";
import type { Card, PlayedCard, PlayerView, Suit } from "@hb/engine";

/** Trumps worth leading to draw the opponent's. */
const DRAW_TRUMPS_FROM = 4;

function lowest(cards: readonly Card[]): Card {
  return cards.reduce((low, card) => (card.rank < low.rank ? card : low));
}

function highest(cards: readonly Card[]): Card {
  return cards.reduce((high, card) => (card.rank > high.rank ? card : high));
}

function cardsIn(hand: readonly Card[], suit: Suit): Card[] {
  return hand.filter((card) => card.suit === suit);
}

/** Every card that has been played to a trick, plus whatever is on the table now. */
function playedCards(view: PlayerView): PlayedCard[] {
  return [...view.completedTricks.flatMap((trick) => trick.cards), ...view.currentTrick];
}

/**
 * Cards of this suit that could still be in the opponent's hand.
 *
 * Everything not in my hand and not yet played — which includes the 26 cards
 * that were never dealt into this deal at all, so this is an over-estimate. It
 * is deliberately the safe direction: a card this says is a winner really is
 * one, and it can only be too cautious, never wrong.
 */
function outstanding(view: PlayerView, suit: Suit): Card[] {
  const accounted = new Set([
    ...view.hand.map(cardId),
    ...playedCards(view).map((played) => cardId(played.card)),
  ]);
  return buildDeck().filter((card) => card.suit === suit && !accounted.has(cardId(card)));
}

/** True when nothing outstanding in the suit can beat this card. */
function isCertainWinner(view: PlayerView, card: Card): boolean {
  return outstanding(view, card.suit).every((other) => other.rank < card.rank);
}

/** Whether the opponent has shown out of a suit, which is the only proof they are void. */
function knownVoid(view: PlayerView, suit: Suit): boolean {
  return view.completedTricks.some((trick) => {
    const led = trick.cards[0];
    if (led === undefined || led.card.suit !== suit) {
      return false;
    }
    return trick.cards.some((played) => played.by === view.opponent && played.card.suit !== suit);
  });
}

function longestSuit(hand: readonly Card[], exclude: Suit | null): Card[] {
  let best: Card[] = [];
  for (const suit of SUITS) {
    if (suit === exclude) {
      continue;
    }
    const cards = cardsIn(hand, suit);
    if (cards.length > best.length) {
      best = cards;
    }
  }
  return best;
}

/**
 * What to throw when the trick cannot be won.
 *
 * Never a trump if there is any choice, and otherwise the lowest card of the
 * shortest suit: length is what runs later, so the cards to spend are the ones
 * in suits too short to ever run.
 */
function discard(legal: readonly Card[], trump: Suit | null): Card {
  const keepable = legal.filter((card) => card.suit !== trump);
  const pool = keepable.length > 0 ? keepable : legal;

  const shortest = pool.reduce((best, card) => {
    const length = pool.filter((other) => other.suit === card.suit).length;
    const bestLength = pool.filter((other) => other.suit === best.suit).length;
    if (length !== bestLength) {
      return length < bestLength ? card : best;
    }
    return card.rank < best.rank ? card : best;
  });

  return lowest(pool.filter((card) => card.suit === shortest.suit));
}

/** Second to the trick, and the whole trick is decided by this one card. */
function follow(view: PlayerView, legal: readonly Card[], led: PlayedCard): Card {
  const trump = trumpSuit(view.contract!.strain);
  const winners = legal.filter((card) => beats(card, led.card, led.card.suit, trump));

  // Win as cheaply as possible — an ace spent on a trick a nine would have
  // taken is a trick given away later.
  return winners.length > 0 ? lowest(winners) : discard(legal, trump);
}

function lead(view: PlayerView, legal: readonly Card[]): Card {
  const trump = trumpSuit(view.contract!.strain);
  const declaring = view.contract!.declarer === view.me;
  const trumps = trump === null ? [] : cardsIn(view.hand, trump);

  // Draw trumps while holding plenty of them: every round takes one of theirs
  // and protects the long suit that has to run later. Pointless once they have
  // shown they have none left.
  if (declaring && trumps.length >= DRAW_TRUMPS_FROM && trump !== null && !knownVoid(view, trump)) {
    return highest(trumps);
  }

  // Cash a suit that cannot be beaten, longest first, since that is the one
  // whose small cards will still be good once the honours have gone.
  const runnable = [...SUITS]
    .map((suit) => cardsIn(view.hand, suit))
    .filter((cards) => cards.length > 0 && cards.some((card) => isCertainWinner(view, card)))
    .sort((a, b) => b.length - a.length)[0];
  if (runnable !== undefined) {
    return highest(runnable.filter((card) => isCertainWinner(view, card)));
  }

  // Otherwise lead low from length, working towards the point where the suit
  // does run.
  const long = longestSuit(view.hand, trump);
  return lowest(long.length > 0 ? long : legal);
}

/**
 * With only two players a trick is two cards, so there is no partner to signal
 * to and no third hand to consider. That collapses card play to a few rules:
 * win as cheaply as you can, throw the least useful thing you hold when you
 * cannot, draw trumps while you hold them, and lead the suits that run.
 */
export function chooseCard(view: PlayerView): Card {
  const legal = playableFrom(view.hand, view.currentTrick);
  if (legal.length === 1) {
    return legal[0]!;
  }

  const led = view.currentTrick[0];
  return led === undefined ? lead(view, legal) : follow(view, legal, led);
}
