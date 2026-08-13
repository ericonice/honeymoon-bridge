/**
 * Core domain types for Honeymoon Bridge.
 *
 * Two players, each a side unto themselves. Identified by index so that all
 * per-player data can be held in fixed two-element tuples.
 */

export type PlayerId = 0 | 1;

export type Pair<T> = [T, T];

/** The four suits, ordered low to high for bidding purposes. */
export type Suit = "C" | "D" | "H" | "S";

/** A denomination that can be bid: the four suits plus no-trump. */
export type Strain = Suit | "NT";

/** 2-10 at face value, 11=J, 12=Q, 13=K, 14=A. Ordering is numeric. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Doubling = "none" | "doubled" | "redoubled";

export interface Bid {
  readonly level: Level;
  readonly strain: Strain;
}

export type Call =
  | { readonly type: "pass" }
  | { readonly type: "double" }
  | { readonly type: "redouble" }
  | { readonly type: "bid"; readonly bid: Bid };

/** A call paired with who made it, as recorded in the auction history. */
export interface AuctionEntry {
  readonly by: PlayerId;
  readonly call: Call;
}

export interface Contract {
  readonly declarer: PlayerId;
  readonly doubling: Doubling;
  readonly level: Level;
  readonly strain: Strain;
}

export interface PlayedCard {
  readonly by: PlayerId;
  readonly card: Card;
}

export interface CompletedTrick {
  readonly cards: readonly PlayedCard[];
  readonly leader: PlayerId;
  readonly winner: PlayerId;
}

/**
 * Which of the two cards a player took on a draw turn. This is public
 * information — the opponent sees the choice, never the cards.
 */
export type DrawChoice = "kept-first" | "took-second";

export interface DrawTurnRecord {
  readonly by: PlayerId;
  readonly choice: DrawChoice;
}

export type DealPhase = "draw" | "auction" | "play" | "complete";

/**
 * Full deal state. This is the privileged view: it contains both hands, the
 * undrawn stock and every discard. It must never be serialized to a client —
 * see `viewFor` in `view.ts`.
 */
export interface DealState {
  readonly auction: readonly AuctionEntry[];
  /** Who has an outstanding, unanswered claim, or null. Cleared by either response. */
  readonly claim: PlayerId | null;
  readonly completedTricks: readonly CompletedTrick[];
  readonly contract: Contract | null;
  readonly currentTrick: readonly PlayedCard[];
  /** Cards each player drew and threw away. Private to that player. */
  readonly discards: Pair<readonly Card[]>;
  readonly drawTurns: readonly DrawTurnRecord[];
  readonly hands: Pair<readonly Card[]>;
  /** The 13-card hands as they stood when the draw phase ended, kept for honors scoring. */
  readonly initialHands: Pair<readonly Card[]> | null;
  /** Card 1 of the current draw turn, revealed to `toAct` and awaiting a decision. */
  readonly pending: Card | null;
  readonly phase: DealPhase;
  /**
   * Whoever's hand has been shown this deal by a claim. Set the instant a claim
   * is offered and, unlike `claim`, never cleared by a denial — the cost of a
   * claim that didn't land is that the hand stays visible for the rest of the
   * deal. Reset only by a fresh deal.
   */
  readonly revealed: PlayerId | null;
  /** Whoever draws first and makes the first call. Alternates deal to deal. */
  readonly starter: PlayerId;
  readonly stock: readonly Card[];
  readonly toAct: PlayerId;
  readonly trickLeader: PlayerId;
  readonly tricksWon: Pair<number>;
  /** True when both players passed the deal out; it must be redealt. */
  readonly passedOut: boolean;
}

export type DealAction =
  | { readonly type: "draw-decide"; readonly keep: boolean }
  | { readonly type: "call"; readonly call: Call }
  | { readonly type: "play"; readonly card: Card }
  /**
   * Declares every remaining trick, on the claimant's own turn to play. Reveals
   * their hand — see `DealState.revealed` — and hands the decision to the
   * opponent via `claim-response`. Full claims only; there is no partial claim.
   */
  | { readonly type: "claim" }
  /** The opponent's answer to an outstanding claim. */
  | { readonly type: "claim-response"; readonly accept: boolean };
