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
  summarise,
  viewFor,
} from "@hb/engine";
import type { DealAction, DealState, PlayerId, TableState } from "@hb/engine";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createHeuristicBot } from "../bot/heuristicBot.js";
import { botActionFor } from "./botTurn.js";
import type { GameSession } from "./session.js";
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
export function useLocalSession(): GameSession {
  const bot = useMemo(() => createHeuristicBot(createRng(randomSeed())), []);
  const [table, setTable] = useState<TableState>(() =>
    startTable({ seed: randomSeed(), starter: HUMAN }),
  );

  const { deal } = table;
  const waitingOnBot = deal.toAct === OPPONENT && deal.phase !== "complete";

  useEffect(() => {
    if (!waitingOnBot) {
      return;
    }

    const timer = setTimeout(() => {
      // The action is chosen out here rather than inside the updater: the bot's
      // generator is stateful, and React may call an updater more than once.
      const action = botActionFor(bot, deal, OPPONENT);
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
      next = applyTableAction(next, next.deal.toAct, botActionFor(bot, next.deal, next.deal.toAct));
    }
    setTable(next);
  }, [bot, table]);

  const advance = useCallback(() => {
    // `randomSeed` is not pure, so the deal is dealt out here rather than
    // inside an updater React may call more than once.
    const dealt = nextDeal(table, randomSeed());
    setTable(dealt);
  }, [table]);

  const summary = summarise(table);

  return {
    act,
    history: summary.history,
    justTaken:
      deal.phase === "draw" ? (deal.hands[HUMAN][deal.hands[HUMAN].length - 1] ?? null) : null,
    lastDraw: drawRevealFor(deal, HUMAN),
    lastOwnDraw: deal.phase === "draw" ? ownDrawPairFor(deal, HUMAN) : null,
    lastTrick: deal.completedTricks[deal.completedTricks.length - 1] ?? null,
    nextDeal: advance,
    opponentHand: import.meta.env.DEV ? sortHand(deal.hands[OPPONENT]) : null,
    opponentLastDraw:
      import.meta.env.DEV && deal.phase === "draw" ? ownDrawPairFor(deal, OPPONENT) : null,
    opponentName: bot.name,
    // Only ever the opponent's turn: seeing card 2 on your own would remove the
    // sight-unseen gamble the phase is built on, even in a development build.
    opponentPending:
      import.meta.env.DEV && deal.phase === "draw" && deal.toAct === OPPONENT ? deal.pending : null,
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
