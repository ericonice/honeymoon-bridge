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
