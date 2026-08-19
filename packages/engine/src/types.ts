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
 * Which card a player took on a draw turn. This is public information — the
 * opponent sees the choice, never the cards.
 *
 * `took-discard` only ever occurs under `DealRules.openDiscard`, and is the one
 * choice that spends three cards rather than two: both of the turn's own cards
 * are thrown, and the card that enters the hand comes off the pile instead.
 */
export type DrawChoice = "kept-first" | "took-discard" | "took-second";

/**
 * Which of the three cards a draw turn offers is the one taken into the hand.
 *
 * `first` and `second` are the turn's own two cards — card 1, seen, and card 2,
 * still sight-unseen at the moment of the decision. `discard` is the face-up top
 * of the discard pile, and is legal only under `DealRules.openDiscard`.
 */
export type DrawTake = "discard" | "first" | "second";

/** A card on the discard pile, and which player threw it there. */
export interface Discard {
  readonly by: PlayerId;
  readonly card: Card;
}

/** What one draw turn spent: the card it yielded, and the one or two it threw. */
export interface DrawSpend {
  /** Card 2 alone on a keep, card 1 alone on a reject, and both on a `took-discard`. */
  readonly discarded: readonly Card[];
  readonly taken: Card;
}

/**
 * The house rules this deal is being played under.
 *
 * Everything here is off in the game as specified in `REQUIREMENTS.md` §1, and
 * carried on `DealState` rather than passed around beside it so that the reducer
 * can answer "is this action legal" from the state alone — which is what lets a
 * server validate a variant it was not itself configured with.
 */
export interface DealRules {
  /**
   * Whether the top of the discard pile lies face up and may be taken instead
   * of either of the turn's own two cards.
   *
   * Off by default, because it is a variant rather than the game. It exists to
   * put interaction into a phase that has none: a turn spends two stock cards
   * whatever is chosen, so under the base rules nothing either player does
   * changes what the other is offered, and 26 of the deal's 52 decisions are two
   * games of solitaire running side by side. With this on, the card you throw is
   * a card they may pick up.
   *
   * Note the property that makes it legible: turns strictly alternate and every
   * turn ends by putting a card the acting player threw on top, so the card on
   * offer is *always* the opponent's most recent discard. It is not a pile to
   * rummage through — it is their last throw, offered to you once.
   */
  readonly openDiscard: boolean;
}

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
  /**
   * Cards each player drew and threw away *and that are still out of play*.
   * Private to that player.
   *
   * The qualifier is what `openDiscard` adds: a card the opponent takes off the
   * pile leaves this list, because the list's whole job is to name cards that
   * are provably nowhere — it is what a bot's recall is built from, and a card
   * now sitting in the other hand is the opposite of that. Under the base rules
   * nothing is ever removed and each list reaches thirteen.
   */
  readonly discards: Pair<readonly Card[]>;
  /**
   * The face-up top of the discard pile, with whoever threw it.
   *
   * Tracked whatever the rules say, since it costs one field and `openDiscard`
   * is what decides whether `viewFor` passes it on. Only the top is ever needed:
   * every turn ends by throwing a card onto the pile, so a card once covered can
   * never be uncovered.
   */
  readonly discardTop: Discard | null;
  readonly drawTurns: readonly DrawTurnRecord[];
  readonly hands: Pair<readonly Card[]>;
  /** The 13-card hands as they stood when the draw phase ended, kept for honors scoring. */
  readonly initialHands: Pair<readonly Card[]> | null;
  /**
   * What each seat's own most recent draw turn spent, for the reveal §1.3 owes
   * them.
   *
   * Recorded rather than derived from the tail of `hands` and `discards`. That
   * inference was sound while every turn threw exactly one card and nothing ever
   * came back off the pile, and `openDiscard` breaks it twice: a turn can throw
   * two, and the opponent taking your last discard removes the very card the
   * inference was reaching for.
   */
  readonly lastDraws: Pair<DrawSpend | null>;
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
  /** The house rules this deal is played under. Fixed for its duration. */
  readonly rules: DealRules;
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
  | { readonly type: "draw-decide"; readonly take: DrawTake }
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
