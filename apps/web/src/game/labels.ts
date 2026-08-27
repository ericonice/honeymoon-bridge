import type { AchievementId, Call, Card, MatchFormat, Rank, Strain, Suit, Tier } from "@hb/engine";

/**
 * What to call the thing being played, given what it is.
 *
 * Every screen that says "rubber" has to say "game" in the short format and
 * "session" in duplicate, and getting one of them wrong is how a player learns
 * the setting did not take. One place to be wrong is better than eight.
 *
 * "Session" rather than "match" for duplicate, because that is what a duplicate
 * evening is called — and because "match" is the word this app already uses for
 * all three of them at once, so borrowing it for one would make the general term
 * ambiguous.
 */
export function matchNoun(format: MatchFormat): string {
  if (format === "duplicate") {
    return "session";
  }
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

/** Diamonds and hearts print red; NT has no symbol and stays with the text color. */
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

/** One achievement family: its name, what it is for, and what earns each tier it has. */
export interface AchievementInfo {
  readonly description: string;
  readonly name: string;
  readonly tiers: Partial<Record<Tier, string>>;
}

/** Display order for the Achievements screen — roughly rarest and most eventful first. */
export const ACHIEVEMENT_ORDER: readonly AchievementId[] = [
  "slam",
  "insult",
  "axe",
  "take-the-rubber",
  "down-but-not-out",
  "nobody-wanted-it",
  "sitzfleisch",
  "two-suiter",
  "against-the-odds",
  "marathon",
  "hands-played",
  "hands-won",
  "hands-lost",
];

export const ACHIEVEMENTS: Record<AchievementId, AchievementInfo> = {
  "against-the-odds": {
    description: "Take card 2 sight-unseen, lifetime.",
    name: "Against the Odds",
    tiers: { bronze: "50 times", gold: "5,000 times", silver: "500 times" },
  },
  axe: {
    description: "Set a contract.",
    name: "The Axe",
    tiers: { bronze: "Down 3", gold: "Down 7", silver: "Down 5" },
  },
  "down-but-not-out": {
    description: "Win a rubber after losing its first game.",
    name: "Down But Not Out",
    tiers: { bronze: "Done it" },
  },
  "hands-lost": {
    description: "Lose a hand, declaring or defending, lifetime.",
    name: "Hands Lost",
    tiers: { bronze: "50 hands", gold: "1,000 hands", silver: "250 hands" },
  },
  "hands-played": {
    description: "Play a hand through to a result, lifetime.",
    name: "Hands Played",
    tiers: { bronze: "50 hands", gold: "1,000 hands", silver: "250 hands" },
  },
  "hands-won": {
    description: "Win a hand, declaring or defending, lifetime.",
    name: "Hands Won",
    tiers: { bronze: "50 hands", gold: "1,000 hands", silver: "250 hands" },
  },
  insult: {
    description: "Make a contract they doubled.",
    name: "The Insult",
    tiers: { bronze: "Doubled", gold: "Redoubled, vulnerable", silver: "Redoubled" },
  },
  marathon: {
    description: "Play rubbers to the end, lifetime.",
    name: "Marathon",
    tiers: { bronze: "10 rubbers", gold: "200 rubbers", silver: "50 rubbers" },
  },
  "nobody-wanted-it": {
    description: "Be dealt a hand that gets passed out.",
    name: "Nobody Wanted It",
    tiers: { bronze: "Done it" },
  },
  sitzfleisch: {
    description: "Win a rubber that runs long, hand after hand.",
    name: "Sitzfleisch",
    tiers: { bronze: "More than 20 hands" },
  },
  slam: {
    description: "Bid and make a slam.",
    name: "Slam",
    tiers: { bronze: "Small slam", gold: "Grand slam, vulnerable", silver: "Grand slam" },
  },
  "take-the-rubber": {
    description: "Win a rubber.",
    name: "Take the Rubber",
    tiers: {
      bronze: "Won it",
      gold: "Won it in two hands",
      silver: "Won it two games to none",
    },
  },
  "two-suiter": {
    description: "Be dealt a hand confined to two suits or fewer.",
    name: "Two-Suiter",
    tiers: { bronze: "Done it" },
  },
};

export function tierLabel(tier: Tier): string {
  if (tier === "gold") {
    return "Gold";
  }
  return tier === "silver" ? "Silver" : "Bronze";
}
