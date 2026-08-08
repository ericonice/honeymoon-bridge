import {
  applyTableAction,
  createRng,
  drawRevealFor,
  nextDeal,
  ownDrawPairFor,
  randomSeed,
  revealsUnseenCard,
  sortHand,
  startTable,
  summarize,
  totalScore,
  viewFor,
  vulnerability,
} from "@hb/engine";
import type { DealAction, DealState, PlayerId, TableState } from "@hb/engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOT_RELEASE } from "../bot/release.js";
import { DEFAULT_GAME_EQUITY } from "../bot/bidValue.js";
import { PSYCH_CREDIT_ON } from "../bot/heuristicBot.js";
import { createSamplingBot } from "../bot/samplingBot.js";
import { botActionFor } from "./botTurn.js";
import { boldness, pace, preferredFormat, psychsEnabled, strength } from "./identity.js";
import { reportRobotRubber } from "./records.js";
import type { GameSession } from "./session.js";
import { drawTurnDuration, setPacing, trickCollectDuration } from "./timing.js";

export const HUMAN: PlayerId = 0;
export const OPPONENT: PlayerId = 1;

/**
 * Hands the bot guesses at before playing each card.
 *
 * Both the strength and the cost. Twenty-five is about 180ms at the opening
 * lead and under 70ms for every card after it, and the work is synchronous on
 * the main thread — it happens inside the pause below, so it eats into an
 * animation rather than delaying the move. Turn it down if that shows on a
 * phone; the bot degrades into one that is unsure rather than one that is wrong.
 */
const SAMPLES = 25;

/**
 * The testing settings, turned into the numbers the bot and the screen take.
 *
 * Kept here rather than in `identity.ts` so that what a choice *means* lives
 * beside what uses it. Every "normal" is the value the code would have had
 * anyway, so leaving all three alone is not a configuration.
 */
function samplesFor(level: ReturnType<typeof strength>): number {
  return level === "strong" ? 60 : level === "weak" ? 6 : SAMPLES;
}

/**
 * Deliberately not symmetric. The measured optimum was above 400 and it was
 * shipped below, because the reference bidder barely doubles and so rewards
 * overbidding in a way a person will not — so "bold" reaches for what the bench
 * wanted and "cautious" goes as far the other way.
 */
function equityFor(level: ReturnType<typeof boldness>): number {
  return level === "bold" ? 550 : level === "cautious" ? 250 : DEFAULT_GAME_EQUITY;
}

function pacingFor(level: ReturnType<typeof pace>): number {
  return level === "brisk" ? 0.6 : level === "slow" ? 1.5 : 1;
}

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

function pauseBefore(state: DealState): number {
  switch (state.phase) {
    case "draw": {
      // With no previous turn to play out, this is the opponent opening the
      // deal — still give the board a beat before anything moves on its own.
      const previous = drawRevealFor(state, HUMAN);
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
 * A rubber against the computer, played out in this browser.
 *
 * The whole `TableState` stays inside this hook and is never handed to a
 * component: the screens are built against `GameSession`, which is the same
 * shape a server will send over a socket. That keeps the hidden-information
 * boundary in one place rather than relying on components not to render what
 * they were given.
 *
 * The rubber itself is the engine's, not this hook's. Turning a finished deal
 * into a scorepad line, deciding who draws first next and when a rubber is won
 * are rules, and a server has to do all of it identically.
 */
export interface LocalSessionOptions {
  /**
   * Whether to hand the screens the computer's cards.
   *
   * Was `import.meta.env.DEV`, so the whole thing folded out of any build that
   * shipped. It is a setting now, offered only to playtesters. What made that
   * safe is that it was never protecting the guarantee it looked like it was
   * protecting: over a network the other hand is not sent to this device at all
   * — `networkSession` holds `opponentHand` at null and `snapshotFor` is what
   * enforces it. This only ever reveals the computer's cards, in a game running
   * wholly on this device, so the only person it can cheat is the one who
   * turned it on.
   */
  readonly peek?: boolean;
}

export function useLocalSession(options: LocalSessionOptions = {}): GameSession {
  const peek = options.peek === true;
  // Read once, when the match starts, for the same reason the format is: a bot
  // that changed how it bid halfway through a rubber would be two opponents.
  const bot = useMemo(
    () =>
      createSamplingBot(createRng(randomSeed()), samplesFor(strength()), {
        gameEquity: equityFor(boldness()),
        psychCredit: psychsEnabled() ? PSYCH_CREDIT_ON : 0,
      }),
    [],
  );
  // Read once, when the match starts. Changing the setting mid-match would move
  // the goalposts on a sitting already under way.
  const [table, setTable] = useState<TableState>(() =>
    startTable({ format: preferredFormat(), seed: randomSeed(), starter: HUMAN }),
  );

  // Read on every render rather than once: unlike the bot, which would be two
  // opponents if it changed mid-rubber, pacing can change under way with no
  // consequence beyond the next animation being faster.
  setPacing(pacingFor(pace()));

  const { deal } = table;
  const waitingOnBot = deal.toAct === OPPONENT && deal.phase !== "complete";

  useEffect(() => {
    if (!waitingOnBot) {
      return;
    }

    const timer = setTimeout(() => {
      // The action is chosen out here rather than inside the updater: the bot's
      // generator is stateful, and React may call an updater more than once.
      const action = botActionFor({
        bot,
        seat: OPPONENT,
        standing: { rubber: table.rubberBefore, vulnerable: vulnerability(table.rubberBefore) },
        state: deal,
      });
      setTable((current) =>
        current === table ? applyTableAction(current, OPPONENT, action) : current,
      );
    }, pauseBefore(deal));

    return () => {
      clearTimeout(timer);
    };
  }, [bot, deal, table, waitingOnBot]);

  const act = useCallback((action: DealAction) => {
    setTable((current) =>
      current.deal.toAct === HUMAN ? applyTableAction(current, HUMAN, action) : current,
    );
  }, []);

  const skipPhase = useCallback(() => {
    const phase = table.deal.phase;
    if (phase === "complete") {
      return;
    }
    // Resolved out here rather than inside the updater: the bot's generator is
    // stateful, and React may call an updater more than once.
    let next = table;
    while (next.deal.phase === phase) {
      const action = botActionFor({
        bot,
        seat: next.deal.toAct,
        standing: { rubber: next.rubberBefore, vulnerable: vulnerability(next.rubberBefore) },
        state: next.deal,
      });
      next = applyTableAction(next, next.deal.toAct, action);
    }
    setTable(next);
  }, [bot, table]);

  const advance = useCallback(() => {
    // `randomSeed` is not pure, so the deal is dealt out here rather than
    // inside an updater React may call more than once.
    const dealt = nextDeal(table, randomSeed());
    setTable(dealt);
  }, [table]);

  const summary = summarize(table);

  // Reported the moment the rubber is won rather than when the player taps on,
  // because tapping on is optional: closing the tab on a won rubber is a
  // perfectly ordinary way to finish, and it would otherwise go unrecorded.
  const reported = useRef(false);
  useEffect(() => {
    if (!summary.rubber.complete || summary.rubber.winner === null || reported.current) {
      return;
    }
    reported.current = true;
    const points = totalScore(summary.rubber);
    void reportRobotRubber({
      botVersion: BOT_RELEASE.version,
      deals: summary.history.length,
      format: summary.rubber.format,
      points: points[HUMAN],
      pointsAgainst: points[OPPONENT],
      won: summary.rubber.winner === HUMAN,
    });
  }, [summary.history.length, summary.rubber]);

  // A new rubber is a new thing to report. `nextDeal` starts one once the last
  // was won, which is the only way past a completed rubber.
  useEffect(() => {
    if (!summary.rubber.complete) {
      reported.current = false;
    }
  }, [summary.rubber.complete]);

  return {
    act,
    history: summary.history,
    justTaken:
      deal.phase === "draw" ? (deal.hands[HUMAN][deal.hands[HUMAN].length - 1] ?? null) : null,
    lastDraw: drawRevealFor(deal, HUMAN),
    lastOwnDraw: deal.phase === "draw" ? ownDrawPairFor(deal, HUMAN) : null,
    lastTrick: deal.completedTricks[deal.completedTricks.length - 1] ?? null,
    nextDeal: advance,
    opponentHand: peek ? sortHand(deal.hands[OPPONENT]) : null,
    opponentLastDraw:
      peek && deal.phase === "draw" ? ownDrawPairFor(deal, OPPONENT) : null,
    opponentName: bot.name,
    // Only ever the opponent's turn: seeing card 2 on your own would remove the
    // sight-unseen gamble the phase is built on, even in a development build.
    opponentPending:
      peek && deal.phase === "draw" && deal.toAct === OPPONENT ? deal.pending : null,
    // The computer neither waits nor asks: `nextDeal` simply deals.
    opponentWaitingToContinue: false,
    rubber: summary.rubber,
    score: summary.score,
    skipPhase,
    view: viewFor(deal, HUMAN),
    vulnerable: summary.vulnerable,
    waitingOnOpponent: waitingOnBot,
    // Nobody to wait for: the computer is not reading the scorepad.
    waitingToContinue: false,
  };
}
