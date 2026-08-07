import {
  auctionIsClosed,
  auctionIsPassedOut,
  contractFrom,
  isLegalCall,
  legalCalls,
} from "./auction.js";
import { beats, buildDeck, hasSuit, opponentOf, removeCard, sameCard, trumpSuit } from "./cards.js";
import { createRng, shuffle } from "./rng.js";
import type {
  Card,
  CompletedTrick,
  DealAction,
  DealState,
  Pair,
  PlayedCard,
  PlayerId,
  Strain,
} from "./types.js";

const HAND_SIZE = 13;
const TRICKS_PER_DEAL = 13;

export interface StartDealOptions {
  readonly seed: number;
  /** The player who draws first and makes the first call. Alternates deal to deal. */
  readonly starter: PlayerId;
}

export function startDeal(options: StartDealOptions): DealState {
  const deck = shuffle(buildDeck(), createRng(options.seed));
  const pending = deck[0]!;

  return {
    auction: [],
    completedTricks: [],
    contract: null,
    currentTrick: [],
    discards: [[], []],
    drawTurns: [],
    hands: [[], []],
    initialHands: null,
    passedOut: false,
    pending,
    phase: "draw",
    starter: options.starter,
    stock: deck.slice(1),
    toAct: options.starter,
    trickLeader: options.starter,
    tricksWon: [0, 0],
  };
}

export function legalActions(state: DealState, player: PlayerId): DealAction[] {
  if (state.toAct !== player || state.phase === "complete") {
    return [];
  }

  switch (state.phase) {
    case "draw": {
      return [
        { type: "draw-decide", keep: true },
        { type: "draw-decide", keep: false },
      ];
    }
    case "auction": {
      return legalCalls(state.auction, player).map((call) => ({ type: "call", call }) as const);
    }
    case "play": {
      return legalPlays(state, player).map((card) => ({ type: "play", card }) as const);
    }
    default: {
      return [];
    }
  }
}

/**
 * Follow suit if able, otherwise anything.
 *
 * Stated over a hand and a trick rather than over `DealState` so that the rule
 * exists once and can also be applied by someone holding only a `PlayerView` —
 * see `legalActionsForView`.
 */
export function playableFrom(hand: readonly Card[], trick: readonly PlayedCard[]): Card[] {
  const lead = trick[0];
  if (lead === undefined) {
    return [...hand];
  }
  const led = lead.card.suit;
  if (hasSuit(hand, led)) {
    return hand.filter((card) => card.suit === led);
  }
  return [...hand];
}

/** The cards a player may legally play right now. */
export function legalPlays(state: DealState, player: PlayerId): Card[] {
  return playableFrom(state.hands[player], state.currentTrick);
}

export function applyAction(state: DealState, player: PlayerId, action: DealAction): DealState {
  if (state.toAct !== player) {
    throw new Error(`It is not player ${player}'s turn`);
  }

  switch (action.type) {
    case "draw-decide": {
      return applyDrawDecision(state, player, action.keep);
    }
    case "call": {
      return applyCall(state, player, action);
    }
    case "play": {
      return applyPlay(state, player, action.card);
    }
  }
}

/**
 * Resolves one draw turn. Two cards leave the stock and exactly one enters the
 * hand: either card 1 is kept and card 2 is drawn and discarded, or card 1 is
 * discarded and card 2 is taken sight-unseen. Both cards are seen by the acting
 * player either way — the discard is recorded so the engine can reason about
 * what that player knows, not so it can be shown back to them.
 */
function applyDrawDecision(state: DealState, player: PlayerId, keep: boolean): DealState {
  if (state.phase !== "draw") {
    throw new Error("Not in the draw phase");
  }
  const first = state.pending;
  if (first === null) {
    throw new Error("No card is pending a decision");
  }
  const second = state.stock[0];
  if (second === undefined) {
    throw new Error("Stock is exhausted mid-turn");
  }

  const taken = keep ? first : second;
  const thrown = keep ? second : first;

  const hands: Pair<readonly Card[]> = [state.hands[0], state.hands[1]];
  hands[player] = [...hands[player], taken];

  const discards: Pair<readonly Card[]> = [state.discards[0], state.discards[1]];
  discards[player] = [...discards[player], thrown];

  const remaining = state.stock.slice(1);
  const drawTurns = [
    ...state.drawTurns,
    { by: player, choice: keep ? ("kept-first" as const) : ("took-second" as const) },
  ];

  const drawPhaseOver = remaining.length === 0;
  if (drawPhaseOver) {
    if (hands[0].length !== HAND_SIZE || hands[1].length !== HAND_SIZE) {
      throw new Error("Draw phase ended with unbalanced hands");
    }
    return {
      ...state,
      discards,
      drawTurns,
      hands,
      initialHands: [hands[0], hands[1]],
      pending: null,
      phase: "auction",
      stock: [],
      toAct: state.starter,
    };
  }

  return {
    ...state,
    discards,
    drawTurns,
    hands,
    pending: remaining[0]!,
    stock: remaining.slice(1),
    toAct: opponentOf(player),
  };
}

function applyCall(
  state: DealState,
  player: PlayerId,
  action: Extract<DealAction, { type: "call" }>,
): DealState {
  if (state.phase !== "auction") {
    throw new Error("Not in the auction");
  }
  if (!isLegalCall(state.auction, player, action.call)) {
    throw new Error("Illegal call");
  }

  const auction = [...state.auction, { by: player, call: action.call }];

  if (!auctionIsClosed(auction)) {
    return { ...state, auction, toAct: opponentOf(player) };
  }

  if (auctionIsPassedOut(auction)) {
    return { ...state, auction, passedOut: true, phase: "complete", toAct: player };
  }

  const contract = contractFrom(auction)!;
  const leader = opponentOf(contract.declarer);
  return {
    ...state,
    auction,
    contract,
    phase: "play",
    toAct: leader,
    trickLeader: leader,
  };
}

function applyPlay(state: DealState, player: PlayerId, card: Card): DealState {
  if (state.phase !== "play") {
    throw new Error("Not in the play phase");
  }
  if (!legalPlays(state, player).some((legal) => sameCard(legal, card))) {
    throw new Error("Illegal card");
  }

  const hands: Pair<readonly Card[]> = [state.hands[0], state.hands[1]];
  hands[player] = removeCard(hands[player], card);

  const played: PlayedCard = { by: player, card };
  const trick = [...state.currentTrick, played];

  if (trick.length < 2) {
    return { ...state, currentTrick: trick, hands, toAct: opponentOf(player) };
  }

  const completed = resolveTrick(trick, state.trickLeader, state.contract!.strain);
  const tricksWon: Pair<number> = [state.tricksWon[0], state.tricksWon[1]];
  tricksWon[completed.winner] += 1;

  const completedTricks = [...state.completedTricks, completed];
  const dealOver = completedTricks.length === TRICKS_PER_DEAL;

  return {
    ...state,
    completedTricks,
    currentTrick: [],
    hands,
    phase: dealOver ? "complete" : "play",
    toAct: completed.winner,
    trickLeader: completed.winner,
    tricksWon,
  };
}

function resolveTrick(
  cards: readonly PlayedCard[],
  leader: PlayerId,
  strain: Strain,
): CompletedTrick {
  const first = cards[0]!;
  const led = first.card.suit;
  const trump = trumpSuit(strain);

  let best = first;
  for (const played of cards.slice(1)) {
    if (beats(played.card, best.card, led, trump)) {
      best = played;
    }
  }

  return { cards, leader, winner: best.by };
}
