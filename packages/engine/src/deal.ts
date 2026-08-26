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
  DrawChoice,
  DrawSpend,
  DrawTake,
  Pair,
  PlayedCard,
  PlayerId,
  Strain,
} from "./types.js";

const HAND_SIZE = 13;
/** Exported so a claim's decision-maker can compute how many tricks remain without a second constant naming the same number. */
export const TRICKS_PER_DEAL = 13;

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
    claim: null,
    completedTricks: [],
    contract: null,
    currentTrick: [],
    discards: [[], []],
    drawTurns: [],
    hands: [[], []],
    initialHands: null,
    lastDraws: [null, null],
    passedOut: false,
    pending,
    phase: "draw",
    revealed: null,
    starter: options.starter,
    stock: deck.slice(1),
    toAct: options.starter,
    trickLeader: options.starter,
    tricksWon: [0, 0],
  };
}

/**
 * Which cards this turn offers, and therefore what a draw decision may name.
 *
 * A constant rather than a function of the state, because it is the same two every
 * turn of every deal. Kept named and exported anyway: `legalActions` and
 * `legalActionsForView` both answer from it, and the reducer validates an incoming
 * decision against it, so the set exists once rather than as three literals that
 * have to agree.
 */
export const DRAW_TAKES: readonly DrawTake[] = ["first", "second"];

export function legalActions(state: DealState, player: PlayerId): DealAction[] {
  if (state.toAct !== player || state.phase === "complete") {
    return [];
  }

  switch (state.phase) {
    case "draw": {
      return DRAW_TAKES.map((take) => ({ type: "draw-decide", take }) as const);
    }
    case "auction": {
      return legalCalls(state.auction, player).map((call) => ({ type: "call", call }) as const);
    }
    case "play": {
      if (state.claim !== null) {
        return [
          { type: "claim-response", accept: true },
          { type: "claim-response", accept: false },
        ];
      }
      return [
        ...legalPlays(state, player).map((card) => ({ type: "play", card }) as const),
        { type: "claim" },
      ];
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
      return applyDrawDecision(state, player, action.take);
    }
    case "call": {
      return applyCall(state, player, action);
    }
    case "play": {
      return applyPlay(state, player, action.card);
    }
    case "claim": {
      return applyClaim(state, player);
    }
    case "claim-response": {
      return applyClaimResponse(state, player, action.accept);
    }
  }
}

const CHOICE_FOR: Record<DrawTake, DrawChoice> = {
  first: "kept-first",
  second: "took-second",
};

/**
 * The card that enters the hand and the card the turn throws, for one choice.
 *
 * Both stock cards are spent whichever is taken — that is what keeps the deck
 * exhausting exactly on turn 26 with thirteen cards in each hand.
 */
function spendFor(take: DrawTake, first: Card, second: Card): DrawSpend {
  switch (take) {
    case "first": {
      return { discarded: [second], taken: first };
    }
    case "second": {
      return { discarded: [first], taken: second };
    }
  }
}

/**
 * Resolves one draw turn. Two cards leave the stock and exactly one enters the
 * hand: either card 1 is kept and card 2 is drawn and discarded, or card 1 is
 * discarded and card 2 is taken sight-unseen. Every card the turn spends is seen
 * by the acting player, which is why the discards are recorded: so the engine can
 * reason about what that player knows, not so they can be shown back.
 */
function applyDrawDecision(state: DealState, player: PlayerId, take: DrawTake): DealState {
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
  if (!DRAW_TAKES.includes(take)) {
    throw new Error(`Taking the ${take} card is not allowed`);
  }

  const spend = spendFor(take, first, second);

  const hands: Pair<readonly Card[]> = [state.hands[0], state.hands[1]];
  hands[player] = [...hands[player], spend.taken];

  const discards: Pair<readonly Card[]> = [state.discards[0], state.discards[1]];
  discards[player] = [...discards[player], ...spend.discarded];

  const lastDraws: Pair<DrawSpend | null> = [state.lastDraws[0], state.lastDraws[1]];
  lastDraws[player] = spend;

  const remaining = state.stock.slice(1);
  const drawTurns = [...state.drawTurns, { by: player, choice: CHOICE_FOR[take] }];

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
      lastDraws,
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
    lastDraws,
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

/**
 * Declares every remaining trick. Hands the decision to the opponent by
 * flipping `toAct` to them, exactly as a call or a draw decision would — the
 * claimant has nothing left to do until they answer.
 */
function applyClaim(state: DealState, player: PlayerId): DealState {
  if (state.phase !== "play") {
    throw new Error("Not in the play phase");
  }
  if (state.claim !== null) {
    throw new Error("A claim is already pending");
  }
  return { ...state, claim: player, revealed: player, toAct: opponentOf(player) };
}

/**
 * The opponent's answer. Accepting awards every trick not yet played to the
 * claimant directly, rather than playing them out — `scoreDeal` and the
 * achievements it feeds only ever read `tricksWon`, never `completedTricks`,
 * so this reaches the identical scored outcome a card-by-card finish would.
 * Denying resumes play exactly where it left off: `currentTrick` was never
 * touched by the claim, and `revealed` stays set — the claimant's hand keeps
 * showing for the rest of this deal, which is the cost of a claim that didn't
 * land.
 */
function applyClaimResponse(state: DealState, player: PlayerId, accept: boolean): DealState {
  if (state.claim === null) {
    throw new Error("No claim is pending");
  }
  const claimant = state.claim;

  if (!accept) {
    return { ...state, claim: null, toAct: claimant };
  }

  const remaining = TRICKS_PER_DEAL - state.completedTricks.length;
  const tricksWon: Pair<number> = [state.tricksWon[0], state.tricksWon[1]];
  tricksWon[claimant] += remaining;
  return { ...state, claim: null, phase: "complete", tricksWon };
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
