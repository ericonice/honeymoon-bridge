import type { Card, PlayerId, Rank, Strain, Suit } from "./types.js";

export const SUITS: readonly Suit[] = ["C", "D", "H", "S"];

export const STRAINS: readonly Strain[] = ["C", "D", "H", "S", "NT"];

export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

/** Rank order for bidding: clubs lowest, no-trump highest. */
export const STRAIN_ORDER: Record<Strain, number> = {
  C: 0,
  D: 1,
  H: 2,
  S: 3,
  NT: 4,
};

/**
 * Suit order for laying out a hand: spades, hearts, clubs, diamonds.
 *
 * Deliberately not the bidding order. This alternates black and red, so the
 * boundary between two suits is visible even in a fan where all you can see of
 * most cards is a narrow strip down the left. In bidding order, diamonds and
 * hearts sit adjacent and both print red, and the join between them disappears.
 */
export const HAND_SUIT_ORDER: Record<Suit, number> = {
  C: 2,
  D: 3,
  H: 1,
  S: 0,
};

const RANK_LABELS: Record<Rank, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

/** A compact, stable identity for a card, e.g. "AS", "10H", "2C". Used for equality and keys. */
export function cardId(card: Card): string {
  return `${RANK_LABELS[card.rank]}${card.suit}`;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** A full 52-card deck in a fixed canonical order. Shuffle before use. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Whether `candidate` beats `best` in a trick.
 *
 * `trump` is null at no-trump. A card only competes if it is a trump or is of
 * the suit led; anything else is a discard and cannot win.
 */
export function beats(candidate: Card, best: Card, led: Suit, trump: Suit | null): boolean {
  const candidateIsTrump = trump !== null && candidate.suit === trump;
  const bestIsTrump = trump !== null && best.suit === trump;

  if (candidateIsTrump && !bestIsTrump) {
    return true;
  }
  if (!candidateIsTrump && bestIsTrump) {
    return false;
  }
  if (candidateIsTrump && bestIsTrump) {
    return candidate.rank > best.rank;
  }
  if (candidate.suit !== led) {
    return false;
  }
  return best.suit === led ? candidate.rank > best.rank : true;
}

export function hasSuit(hand: readonly Card[], suit: Suit): boolean {
  return hand.some((card) => card.suit === suit);
}

export function removeCard(hand: readonly Card[], card: Card): Card[] {
  const index = hand.findIndex((held) => sameCard(held, card));
  if (index === -1) {
    throw new Error(`Card ${cardId(card)} is not in hand`);
  }
  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

/** The trump suit of a strain, or null at no-trump. */
export function trumpSuit(strain: Strain): Suit | null {
  return strain === "NT" ? null : strain;
}

export function opponentOf(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

/** Sorted for display: by `HAND_SUIT_ORDER`, then rank descending within a suit. */
export function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) {
      return HAND_SUIT_ORDER[a.suit] - HAND_SUIT_ORDER[b.suit];
    }
    return b.rank - a.rank;
  });
}
