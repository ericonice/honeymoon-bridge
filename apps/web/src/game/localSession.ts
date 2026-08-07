import {
  applyAction,
  applyDealScore,
  createRng,
  newRubber,
  opponentOf,
  randomSeed,
  scoreDeal,
  sortHand,
  startDeal,
  viewFor,
  vulnerability,
} from "@hb/engine";
import type {
  Card,
  CompletedTrick,
  Contract,
  DealAction,
  DealScore,
  DealState,
  DrawChoice,
  Pair,
  PlayerId,
  PlayerView,
  RubberState,
} from "@hb/engine";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createHeuristicBot } from "../bot/heuristicBot.js";
import { botActionFor } from "./botTurn.js";
import { drawTurnDuration, trickCollectDuration } from "./timing.js";

export const HUMAN: PlayerId = 0;
export const OPPONENT: PlayerId = 1;

/**
 * How long the board is left alone before the opponent acts.
 *
 * The board is the only record of what just happened, so a finished trick has
 * to sit there long enough to be read before the next card lands on top of it.
 * The draw phase takes its pause from `drawTurnDuration` instead, so a turn's
 * animation always finishes before the next one starts.
 */
const PAUSE_MS = {
  auction: 800,
  play: 700,
};

/**
 * The two cards of the draw turn that just resolved, for the animation that
 * plays them to their destinations.
 *
 * Your own two cards are named; the opponent's are null and travel face down.
 * That asymmetry is the whole information model of the draw phase in one shape:
 * §1.3 has you look at both of your cards — including the one you throw away on
 * a keep, which you would otherwise never see — while the opponent's choice is
 * public and their cards never are.
 *
 * This is a transient. Nothing retains it, and there is no way back to a turn
 * once its animation has played.
 */
/** The two cards one draw turn spent: one into the hand, one into the discard. */
export interface DrawPair {
  readonly discarded: Card;
  readonly taken: Card;
}

/**
 * The pair a player's most recent draw turn spent, whenever that turn was.
 *
 * `applyDrawDecision` appends to both lists every turn, so the last entry of
 * each is that player's latest, regardless of whose turn resolved most recently.
 */
function lastPairFor(state: DealState, player: PlayerId): DrawPair | null {
  const taken = state.hands[player][state.hands[player].length - 1];
  const discarded = state.discards[player][state.discards[player].length - 1];
  return taken === undefined || discarded === undefined ? null : { discarded, taken };
}

export interface DrawReveal {
  readonly by: PlayerId;
  readonly choice: DrawChoice;
  /** The card thrown away, if it was yours to see. */
  readonly discarded: Card | null;
  /** The card that went into a hand, if it was yours to see. */
  readonly taken: Card | null;
  /** Which draw turn this was, so a repeated choice still restarts the animation. */
  readonly turn: number;
}

/**
 * One deal's line on the scorepad.
 *
 * `RubberState` is deliberately aggregate — it knows the totals, not how they
 * were arrived at — so the running record is kept here instead. A rubber runs
 * several deals and the whole point of a scorepad is being able to see how the
 * standing was reached.
 */
export interface DealRecord {
  /** Null when the deal was passed out and nothing was scored. */
  readonly contract: Contract | null;
  readonly score: DealScore | null;
  readonly tricksWon: Pair<number>;
  /** Set when this deal took a side over 100 below the line, so a game line is drawn under it. */
  readonly wonGameBy: PlayerId | null;
}

export function recordFor(
  state: DealState,
  score: DealScore | null,
  before: RubberState,
  after: RubberState,
): DealRecord {
  const wonGameBy: PlayerId | null =
    after.gamesWon[0] > before.gamesWon[0] ? 0 : after.gamesWon[1] > before.gamesWon[1] ? 1 : null;

  return { contract: state.contract, score, tricksWon: state.tricksWon, wonGameBy };
}

export interface GameSession {
  readonly botName: string;
  /** True whenever the deal is waiting on the opponent rather than on you. */
  readonly botThinking: boolean;
  /**
   * The card most recently added to your hand, while the draw is running.
   *
   * Your hand is shown sorted, so a card taken sight-unseen lands in the middle
   * of twelve others and is genuinely hard to pick out. Marking it answers
   * "what did I just gain?" and shows nothing that is not already on screen.
   */
  readonly justTaken: Card | null;
  /** The draw turn that just resolved, or null before the first one. */
  readonly lastDraw: DrawReveal | null;
  /**
   * The opponent's actual cards. Null in any build that ships.
   *
   * This is the one thing the rest of the app is built to make impossible, so
   * it is deliberately *not* part of `PlayerView` — that shape is what crosses
   * the wire and what a bot is given, and there are tests asserting this is
   * absent from it. It is a separate, named hole in the local session, gated on
   * `import.meta.env.DEV` so the compiler removes it from a production build.
   *
   * It cannot be a runtime flag like the skip controls. Those are safe to ship
   * because they cannot show you anything you are not entitled to see; this can
   * show you exactly that, which is the line drawn in REQUIREMENTS §3.6.
   */
  readonly opponentHand: readonly Card[] | null;
  /**
   * Card 1 of the opponent's draw turn — the card they are looking at while
   * they decide. Null in any build that ships, and null when it is not their
   * turn.
   *
   * Deliberately card 1 only, the same card you would be shown in their seat.
   * Card 2 is not offered even here: it is the thing neither player may see
   * before deciding, and putting it on screen would make a bad decision and an
   * unlucky one impossible to tell apart the other way round.
   */
  readonly opponentPending: Card | null;
  /**
   * The two cards of the opponent's last draw turn. Null in any build that
   * ships. Lets the running commentary name them while peeking.
   */
  readonly opponentLastDraw: DrawPair | null;
  /**
   * The two cards of *your* last draw turn — the one you took and the one you
   * threw away.
   *
   * Not a development hole: both were yours to see at the time (§1.3), and this
   * only reaches back to the turn just played. It exists because the reveal is
   * a moving card that can be missed, not to spare you remembering.
   */
  readonly lastOwnDraw: DrawPair | null;
  /** The resolved trick still lying on the table, until the next card is played. */
  readonly lastTrick: CompletedTrick | null;
  /**
   * Every deal of the current rubber, oldest first, including the one just
   * finished. Cleared when a new rubber starts.
   */
  readonly history: readonly DealRecord[];
  /**
   * The rubber including the deal just finished.
   *
   * Derived rather than stored, so a completed deal cannot be scored into the
   * rubber twice however many times this renders. It is committed only when
   * `nextDeal` moves on.
   */
  readonly rubber: RubberState;
  /** Present once the deal is complete and was not passed out. */
  readonly score: DealScore | null;
  readonly view: PlayerView;
  /** Vulnerability as it stood for the deal in progress or just finished. */
  readonly vulnerable: Pair<boolean>;
  act(action: DealAction): void;
  /** Deals again, starting a fresh rubber if the last one has been won. */
  nextDeal(): void;
  /**
   * Plays whatever phase is in progress out at once, both seats decided at
   * random, and stops as soon as the deal moves on.
   *
   * Development only. Twenty-six draw turns and thirteen tricks are the game;
   * they are also the wrong thing to sit through for the tenth time on the way
   * to checking something in the scoring, and a rubber takes several deals to
   * finish. It drives the same `applyAction` path as a real turn, so nothing
   * about the rules is bypassed and the results are ordinary legal results.
   */
  skipPhase(): void;
}

function pauseBefore(state: DealState): number {
  switch (state.phase) {
    case "draw": {
      // With no previous turn to play out, this is the opponent opening the
      // deal — still give the board a beat before anything moves on its own.
      const previous = lastDrawReveal(state);
      return drawTurnDuration(
        previous === null || previous.by === HUMAN,
        previous !== null && revealsUnseenCard(previous),
      );
    }
    case "auction": {
      return PAUSE_MS.auction;
    }
    default: {
      // A trick the opponent has just won is still being collected on screen;
      // it must finish before they lead to the next one.
      const trickJustResolved = state.currentTrick.length === 0 && state.completedTricks.length > 0;
      return trickJustResolved ? trickCollectDuration() : PAUSE_MS.play;
    }
  }
}

/**
 * Reads the turn that just resolved out of the state. `applyDrawDecision`
 * appends to both the hand and the discards, so the last entry of each is the
 * pair of cards this turn spent.
 */
export function lastDrawReveal(state: DealState): DrawReveal | null {
  const turn = state.drawTurns.length;
  const record = state.drawTurns[turn - 1];
  if (record === undefined) {
    return null;
  }

  const mine = record.by === HUMAN;
  const hand = state.hands[HUMAN];
  const discards = state.discards[HUMAN];

  return {
    by: record.by,
    choice: record.choice,
    discarded: mine ? (discards[discards.length - 1] ?? null) : null,
    taken: mine ? (hand[hand.length - 1] ?? null) : null,
    turn,
  };
}

/**
 * True when the turn puts a card in front of you that you have not seen before.
 *
 * That is only ever your own card 2 after a keep. On a reject you saw card 1 as
 * the pending card and card 2 arrives in your hand where you can study it; the
 * opponent's cards are never yours to see at all.
 */
export function revealsUnseenCard(reveal: DrawReveal): boolean {
  return reveal.by === HUMAN && reveal.choice === "kept-first";
}

/** The finished deal's score, or null while it is still being played or was passed out. */
export function dealScoreFor(state: DealState, vulnerable: Pair<boolean>): DealScore | null {
  if (state.phase !== "complete" || state.contract === null || state.initialHands === null) {
    return null;
  }
  return scoreDeal(
    { contract: state.contract, hands: state.initialHands, tricksWon: state.tricksWon },
    vulnerable,
  );
}

function freshDeal(starter: PlayerId): DealState {
  return startDeal({ seed: randomSeed(), starter });
}

/**
 * Hosts one deal against the computer.
 *
 * The full `DealState` stays inside this hook and is never handed to a
 * component — the UI is built entirely against `PlayerView`, the same shape the
 * server will eventually send over a socket. That keeps the hidden-information
 * boundary in one place instead of relying on components not to render what
 * they were given.
 */
export function useGameSession(): GameSession {
  const bot = useMemo(() => createHeuristicBot(createRng(randomSeed())), []);
  const [state, setState] = useState<DealState>(() => freshDeal(HUMAN));
  // The rubber as it stood when this deal began. Vulnerability is fixed for the
  // duration of a deal, so this is what the deal must be scored against.
  const [rubberBefore, setRubberBefore] = useState<RubberState>(newRubber);
  // Deals already committed to the scorepad. The one in progress is appended
  // for display only, and joins this list when `nextDeal` moves on.
  const [dealsPlayed, setDealsPlayed] = useState<readonly DealRecord[]>([]);

  const waitingOnBot = state.toAct === OPPONENT && state.phase !== "complete";

  useEffect(() => {
    if (!waitingOnBot) {
      return;
    }

    const timer = setTimeout(() => {
      // The action is chosen out here rather than inside the updater: the bot's
      // generator is stateful, and React may call an updater more than once.
      const action = botActionFor(bot, state, OPPONENT);
      setState((current) => (current === state ? applyAction(current, OPPONENT, action) : current));
    }, pauseBefore(state));

    return () => {
      clearTimeout(timer);
    };
  }, [bot, state, waitingOnBot]);

  const act = useCallback((action: DealAction) => {
    setState((current) => (current.toAct === HUMAN ? applyAction(current, HUMAN, action) : current));
  }, []);

  const skipPhase = useCallback(() => {
    const phase = state.phase;
    if (phase === "complete") {
      return;
    }
    // Resolved out here rather than inside the updater: the bot's generator is
    // stateful, and React may call an updater more than once.
    let next = state;
    while (next.phase === phase) {
      next = applyAction(next, next.toAct, botActionFor(bot, next, next.toAct));
    }
    setState(next);
  }, [bot, state]);

  // Vulnerability is fixed for the duration of a deal, so it reads from the
  // rubber as it stood when the deal began, not from the one being derived.
  const vulnerable = vulnerability(rubberBefore);

  const score = dealScoreFor(state, vulnerable);

  // Derived, not accumulated: however many times this renders, the deal is
  // folded into the rubber exactly once, and it is `nextDeal` committing this
  // value that actually advances the rubber.
  const rubber = score === null ? rubberBefore : applyDealScore(rubberBefore, score);

  const history =
    state.phase === "complete"
      ? [...dealsPlayed, recordFor(state, score, rubberBefore, rubber)]
      : dealsPlayed;

  const nextDeal = useCallback(() => {
    // A deal passed out is redealt by the same player. Otherwise the right to
    // draw first alternates, which is this game's deal rotation.
    const starter = state.passedOut ? state.starter : opponentOf(state.starter);
    // Computed out here rather than inside an updater: `randomSeed` is not
    // pure, and React may call an updater more than once.
    const dealt = freshDeal(starter);
    const won = rubber.complete;

    setRubberBefore(won ? newRubber() : rubber);
    setDealsPlayed(won ? [] : history);
    setState(dealt);
  }, [history, rubber, state]);

  return {
    act,
    botName: bot.name,
    botThinking: waitingOnBot,
    justTaken:
      state.phase === "draw" ? (state.hands[HUMAN][state.hands[HUMAN].length - 1] ?? null) : null,
    lastDraw: lastDrawReveal(state),
    history,
    lastOwnDraw: state.phase === "draw" ? lastPairFor(state, HUMAN) : null,
    lastTrick: state.completedTricks[state.completedTricks.length - 1] ?? null,
    nextDeal,
    opponentLastDraw:
      import.meta.env.DEV && state.phase === "draw" ? lastPairFor(state, OPPONENT) : null,
    opponentHand: import.meta.env.DEV ? sortHand(state.hands[OPPONENT]) : null,
    // Only ever the opponent's turn: seeing card 2 on your own would remove the
    // sight-unseen gamble the phase is built on, even in a development build.
    opponentPending:
      import.meta.env.DEV && state.phase === "draw" && state.toAct === OPPONENT
        ? state.pending
        : null,
    rubber,
    score,
    skipPhase,
    view: viewFor(state, HUMAN),
    vulnerable,
  };
}
