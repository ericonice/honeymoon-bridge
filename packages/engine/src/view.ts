import { legalCalls } from "./auction.js";
import { opponentOf, sortHand } from "./cards.js";
import { playableFrom } from "./deal.js";
import type {
  AuctionEntry,
  Card,
  CompletedTrick,
  Contract,
  DealAction,
  DealPhase,
  DealState,
  DrawChoice,
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
 */
export interface PlayerView {
  readonly auction: readonly AuctionEntry[];
  readonly completedTricks: readonly CompletedTrick[];
  readonly contract: Contract | null;
  readonly currentTrick: readonly PlayedCard[];
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
    completedTricks: state.completedTricks,
    contract: state.contract,
    currentTrick: state.currentTrick,
    drawTurns: state.drawTurns,
    hand: sortHand(state.hands[me]),
    handSizes: [state.hands[0].length, state.hands[1].length],
    me,
    opponent: opponentOf(me),
    passedOut: state.passedOut,
    pending: myTurn && state.phase === "draw" ? state.pending : null,
    phase: state.phase,
    starter: state.starter,
    stockRemaining: state.stock.length + (state.pending === null ? 0 : 1),
    toAct: state.toAct,
    trickLeader: state.trickLeader,
    tricksWon: state.tricksWon,
  };
}

/** The two cards one draw turn spent: one into a hand, one into the discard. */
export interface DrawPair {
  readonly discarded: Card;
  readonly taken: Card;
}

/**
 * The draw turn that just resolved, as one seat is entitled to see it.
 *
 * Your own two cards are named; the opponent's are null. That asymmetry is the
 * information model of the draw phase in one shape — §1.3 has you look at both
 * of your own cards, including the one you throw away on a keep, while the
 * opponent's *choice* is public and their cards never are.
 *
 * It lives here beside `viewFor` because it is the same question: what may this
 * seat be told. A server sending this has to get it right per seat, and getting
 * it wrong would hand over a card nobody should see.
 */
export interface DrawReveal {
  readonly by: PlayerId;
  readonly choice: DrawChoice;
  /** The card thrown away, if it was this seat's to see. */
  readonly discarded: Card | null;
  /** The card that went into a hand, if it was this seat's to see. */
  readonly taken: Card | null;
  /** Which draw turn this was, so a repeated choice is still a new event. */
  readonly turn: number;
}

/**
 * `applyDrawDecision` appends to both the hand and the discards every turn, so
 * the last entry of each is the pair that turn spent.
 */
function lastPair(state: DealState, player: PlayerId): DrawPair | null {
  const hand = state.hands[player];
  const discards = state.discards[player];
  const taken = hand[hand.length - 1];
  const discarded = discards[discards.length - 1];
  return taken === undefined || discarded === undefined ? null : { discarded, taken };
}

export function drawRevealFor(state: DealState, me: PlayerId): DrawReveal | null {
  const turn = state.drawTurns.length;
  const record = state.drawTurns[turn - 1];
  if (record === undefined) {
    return null;
  }

  const pair = record.by === me ? lastPair(state, me) : null;
  return {
    by: record.by,
    choice: record.choice,
    discarded: pair?.discarded ?? null,
    taken: pair?.taken ?? null,
    turn,
  };
}

/** The pair this seat's own most recent turn spent, whenever that turn was. */
export function ownDrawPairFor(state: DealState, me: PlayerId): DrawPair | null {
  return lastPair(state, me);
}

/**
 * True when a resolved turn puts a card in front of this seat that it has not
 * seen before — only ever its own card 2 after a keep.
 *
 * Read off `taken`, which is filled in only for the seat's own turn, so this
 * needs no second opinion about whose turn it was.
 */
export function revealsUnseenCard(reveal: DrawReveal): boolean {
  return reveal.taken !== null && reveal.choice === "kept-first";
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
      return [
        { type: "draw-decide", keep: true },
        { type: "draw-decide", keep: false },
      ];
    }
    case "auction": {
      return legalCalls(view.auction, view.me).map((call) => ({ type: "call", call }) as const);
    }
    case "play": {
      return playableFrom(view.hand, view.currentTrick).map(
        (card) => ({ type: "play", card }) as const,
      );
    }
    default: {
      return [];
    }
  }
}
