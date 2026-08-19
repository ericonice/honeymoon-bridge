import { legalCalls } from "./auction.js";
import { opponentOf, sortHand } from "./cards.js";
import { playableFrom, takesFrom } from "./deal.js";
import type {
  AuctionEntry,
  Card,
  CompletedTrick,
  Contract,
  DealAction,
  DealPhase,
  DealRules,
  DealState,
  DrawChoice,
  DrawSpend,
  DrawTurnRecord,
  Pair,
  PlayedCard,
  PlayerId,
} from "./types.js";

/**
 * Everything one player is entitled to know.
 *
 * This is the only shape that may cross the wire to a client, and the only
 * shape a bot is given. Three deliberate omissions:
 *
 *  - the opponent's hand and the undrawn stock, which would make the game
 *    trivially cheatable from devtools;
 *  - the opponent's discards, which are face down and permanently gone;
 *  - *the player's own discards*, because the app does not show them back. A
 *    player has seen 13 cards they threw away and remembering them is part of
 *    the game. A bot's recall is supplied to it separately as explicit state,
 *    so that imperfect memory stays available as a difficulty lever.
 *
 * `openDiscard` cuts one card out of the second and third of those, and exactly
 * one: `discardTop` is a card both seats can see lying face up on the table, so
 * it is sent to both. The card *under* it never becomes visible again, which is
 * why one card is all this ever has to carry.
 */
export interface PlayerView {
  readonly auction: readonly AuctionEntry[];
  /** Mirrors `DealState.claim` — who has an outstanding claim, or null. Public to both seats. */
  readonly claim: PlayerId | null;
  readonly completedTricks: readonly CompletedTrick[];
  readonly contract: Contract | null;
  readonly currentTrick: readonly PlayedCard[];
  /**
   * The face-up top of the discard pile, under `openDiscard` and during the draw.
   *
   * Null whenever the variant is off, which is what keeps the base game's
   * projection exactly as narrow as it always was. Sent to both seats and at all
   * times during the phase, not only to whoever is on turn: it is a card lying
   * face up on the table, and watching what the opponent throws is the point of
   * the variant. On your own turn it is always their last discard — the one you
   * may take — and on theirs it is your own, which tells you nothing new.
   */
  readonly discardTop: Card | null;
  /** Public record of which card each player took on each draw turn. */
  readonly drawTurns: readonly DrawTurnRecord[];
  readonly hand: readonly Card[];
  readonly handSizes: Pair<number>;
  readonly me: PlayerId;
  readonly opponent: PlayerId;
  readonly passedOut: boolean;
  /** Card 1 of the current draw turn — present only when it is this player's decision. */
  readonly pending: Card | null;
  readonly phase: DealPhase;
  /**
   * The opponent's hand, and only ever the opponent's, once a claim has shown
   * it — see `DealState.revealed`. Null before any claim this deal, and never
   * populated with your own hand: you already have that in `hand`.
   */
  readonly revealedHand: { readonly by: PlayerId; readonly cards: readonly Card[] } | null;
  /** The house rules in force, so the UI and a bot can tell which moves exist. */
  readonly rules: DealRules;
  readonly starter: PlayerId;
  readonly stockRemaining: number;
  readonly toAct: PlayerId;
  readonly trickLeader: PlayerId;
  readonly tricksWon: Pair<number>;
}

export function viewFor(state: DealState, me: PlayerId): PlayerView {
  const myTurn = state.toAct === me;

  return {
    auction: state.auction,
    claim: state.claim,
    completedTricks: state.completedTricks,
    contract: state.contract,
    currentTrick: state.currentTrick,
    discardTop:
      state.rules.openDiscard && state.phase === "draw" ? (state.discardTop?.card ?? null) : null,
    drawTurns: state.drawTurns,
    hand: sortHand(state.hands[me]),
    handSizes: [state.hands[0].length, state.hands[1].length],
    me,
    opponent: opponentOf(me),
    passedOut: state.passedOut,
    pending: myTurn && state.phase === "draw" ? state.pending : null,
    phase: state.phase,
    revealedHand:
      state.revealed !== null && state.revealed !== me
        ? { by: state.revealed, cards: state.hands[state.revealed] }
        : null,
    rules: state.rules,
    starter: state.starter,
    stockRemaining: state.stock.length + (state.pending === null ? 0 : 1),
    toAct: state.toAct,
    trickLeader: state.trickLeader,
    tricksWon: state.tricksWon,
  };
}

/**
 * The draw turn that just resolved, as one seat is entitled to see it.
 *
 * Your own two cards are named; the opponent's are null. That asymmetry is the
 * information model of the draw phase in one shape — §1.3 has you look at both
 * of your own cards, including the one you throw away on a keep, while the
 * opponent's *choice* is public and their cards never are.
 *
 * `openDiscard` puts exactly one card through that asymmetry: the one they took
 * off the pile. It was lying face up when they took it — `viewFor` was sending it
 * to this seat as `discardTop` on the turn before — so declining to name it now
 * would be hiding a card this seat has been staring at, which is not a rule the
 * information model has anywhere. Their card 1 and card 2 stay theirs.
 *
 * It lives here beside `viewFor` because it is the same question: what may this
 * seat be told. A server sending this has to get it right per seat, and getting
 * it wrong would hand over a card nobody should see.
 */
export interface DrawReveal {
  readonly by: PlayerId;
  readonly choice: DrawChoice;
  /**
   * The cards thrown away, if they were this seat's to see. Empty when they were
   * not; one card for a keep or a reject, and two for a `took-discard`, which
   * throws both of its own and takes off the pile instead.
   */
  readonly discarded: readonly Card[];
  /**
   * The card that went into a hand, when this seat may see it: always for its own
   * turn, and for the opponent's only when they lifted it off the face-up pile.
   */
  readonly taken: Card | null;
  /** Which draw turn this was, so a repeated choice is still a new event. */
  readonly turn: number;
}

/**
 * Whether a resolved turn's taken card is one the other seat may be told.
 *
 * True only for a card taken off the open pile, which was public before it moved.
 * Stated as its own function because it is a rule about hidden information and the
 * server has to apply it per seat — the kind of thing that must be one testable
 * answer rather than a condition inlined at a call site.
 */
function takenIsPublic(state: DealState, choice: DrawChoice): boolean {
  return state.rules.openDiscard && choice === "took-discard";
}

export function drawRevealFor(state: DealState, me: PlayerId): DrawReveal | null {
  const turn = state.drawTurns.length;
  const record = state.drawTurns[turn - 1];
  if (record === undefined) {
    return null;
  }

  const mine = record.by === me;
  const spend = state.lastDraws[record.by];
  const shown = mine || takenIsPublic(state, record.choice);
  return {
    by: record.by,
    choice: record.choice,
    // Never theirs: card 1 and card 2 are the two cards this seat has no claim on,
    // and a `took-discard` throws both of them.
    discarded: mine ? (spend?.discarded ?? []) : [],
    taken: shown ? (spend?.taken ?? null) : null,
    turn,
  };
}

/** What this seat's own most recent turn spent, whenever that turn was. */
export function ownDrawPairFor(state: DealState, me: PlayerId): DrawSpend | null {
  return state.lastDraws[me];
}

/**
 * Whether a choice throws card 2 away rather than taking it into the hand.
 *
 * `took-second` is the one that does not: card 2 goes to the hand, where it is on
 * screen from then on and needs no reveal of its own. Both others throw it unseen,
 * and §1.3 requires it be held long enough to read on the way out. Stated here so
 * that the screen deciding how long a turn takes and the reveal deciding what it
 * shows read the same rule rather than each keeping a list of choices.
 */
export function discardsCardTwo(choice: DrawChoice): boolean {
  return choice !== "took-second";
}

/**
 * True when a resolved turn puts a card in front of this seat that it has not
 * seen before — only ever its own card 2, and only when the turn threw it away.
 *
 * Read off `discarded`, which is filled in only for the seat's *own* turn, so this
 * needs no second opinion about whose turn it was. Deliberately not off `taken`,
 * which it used to be: under `openDiscard` that is also filled in for the opponent
 * lifting a card off the pile, and that card is one this seat has already been
 * looking at — the exact opposite of what this asks.
 */
export function revealsUnseenCard(reveal: DrawReveal): boolean {
  return reveal.discarded.length > 0 && discardsCardTwo(reveal.choice);
}

/**
 * Both hands as they stood for this deal, once every card is public.
 *
 * Every card either player held was played face up to a trick, so laying out
 * `completedTricks` by `by` adds nothing beyond what already crossed the
 * wire — it is not a fourth omission-to-worry-about alongside the three in
 * `PlayerView`'s own doc comment, just those same cards regrouped.
 *
 * Null for anything short of a full thirteen tricks — in particular, an
 * accepted claim ends the deal with cards still in a hand, and from the
 * claimant's own view the defender's unplayed hand is never sent at all (see
 * `revealedHand`). A denied claim that got played out to the end is not
 * short: `completedTricks` reaches thirteen the same as a deal with no claim
 * in it ever did.
 */
export function finishedHandsFor(view: PlayerView): Pair<readonly Card[]> | null {
  if (view.completedTricks.length !== 13) {
    return null;
  }
  const hands: [Card[], Card[]] = [[], []];
  for (const trick of view.completedTricks) {
    for (const played of trick.cards) {
      hands[played.by].push(played.card);
    }
  }
  return [sortHand(hands[0]), sortHand(hands[1])];
}

/**
 * The actions a player may take, decided from their own view alone.
 *
 * `legalActions` answers the same question but needs the privileged state. This
 * is the counterpart for everyone who only holds a `PlayerView`: the UI working
 * out what to enable, and any bot, which must never be handed a `DealState`.
 * Both call into the same rules rather than restating them.
 */
export function legalActionsForView(view: PlayerView): DealAction[] {
  if (view.toAct !== view.me || view.phase === "complete") {
    return [];
  }

  switch (view.phase) {
    case "draw": {
      if (view.pending === null) {
        return [];
      }
      return takesFrom(view.rules, view.discardTop).map(
        (take) => ({ type: "draw-decide", take }) as const,
      );
    }
    case "auction": {
      return legalCalls(view.auction, view.me).map((call) => ({ type: "call", call }) as const);
    }
    case "play": {
      if (view.claim !== null) {
        return [
          { type: "claim-response", accept: true },
          { type: "claim-response", accept: false },
        ];
      }
      return [
        ...playableFrom(view.hand, view.currentTrick).map(
          (card) => ({ type: "play", card }) as const,
        ),
        { type: "claim" },
      ];
    }
    default: {
      return [];
    }
  }
}
