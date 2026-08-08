import type { Call, Card, MatchFormat, Rank, Strain, Suit } from "@hb/engine";

/**
 * What to call the thing being played, given how long it runs.
 *
 * Every screen that says "rubber" has to say "game" in the short format, and
 * getting one of them wrong is how a player learns the setting did not take.
 * One place to be wrong is better than eight.
 */
export function matchNoun(format: MatchFormat): string {
  return format === "game" ? "game" : "rubber";
}

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

const SUIT_SYMBOLS: Record<Suit, string> = {
  C: "♣",
  D: "♦",
  H: "♥",
  S: "♠",
};

export function rankLabel(rank: Rank): string {
  return RANK_LABELS[rank];
}

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit];
}

/** Diamonds and hearts print red; NT has no symbol and stays with the text colour. */
export function suitIsRed(suit: Suit): boolean {
  return suit === "D" || suit === "H";
}

export function strainSymbol(strain: Strain): string {
  return strain === "NT" ? "NT" : SUIT_SYMBOLS[strain];
}

export function strainIsRed(strain: Strain): boolean {
  return strain !== "NT" && suitIsRed(strain);
}

const SUIT_NAMES: Record<Suit, string> = {
  C: "clubs",
  D: "diamonds",
  H: "hearts",
  S: "spades",
};

/** Spelled out, for screen readers — the suit symbols do not read aloud usefully. */
export function spokenCardLabel(card: Card): string {
  return `${RANK_LABELS[card.rank]} of ${SUIT_NAMES[card.suit]}`;
}

export function callLabel(call: Call): string {
  switch (call.type) {
    case "pass": {
      return "Pass";
    }
    case "double": {
      return "Dbl";
    }
    case "redouble": {
      return "Rdbl";
    }
    case "bid": {
      return `${call.bid.level}${strainSymbol(call.bid.strain)}`;
    }
  }
}
