import {
  applyTableAction,
  createRng,
  dealFacts,
  drawRevealFor,
  nextDeal,
  ownDrawPairFor,
  randomSeed,
  rubberFacts,
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
import { DISGUISE_CREDIT_ON } from "../bot/heuristicBot.js";
import { createSamplingBot } from "../bot/samplingBot.js";
import { useAchievementTracker } from "./achievements.js";
import { botActionFor } from "./botTurn.js";
import { reportHandLog } from "./handLog.js";
import { boldness, disguiseEnabled, pace, preferredFormat, strength } from "./identity.js";
import { reportRobotRubber } from "./records.js";
import type { GameSession } from "./session.js";
import { drawPauseBefore, paced, setPacing } from "./timing.js";

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
 * beside what uses it. "Normal" is still the passthrough in each mapping
 * below, but it is no longer the shipped default — `identity.ts` now returns
 * bold, strong and brisk when nothing is stored, so those are the numbers a
 * fresh install actually plays against.
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
  /** Following a card this seat just led — the ordinary "computer is thinking" beat. */
  play: 700,
  /**
   * Leading the next trick, right after winning the one before it.
   *
   * `TRICK_TIMING.hold` and `.sweep` already spent a beat of their own on that
   * trick — 1.8s — before this ever runs, since the scheduling effect below
   * waits on `awaitingDismissal` clearing first. Stacking the ordinary 700ms
   * "thinking" pause on top of that read as a stall rather than a beat: the
   * trick already had its moment on screen, and the sweep toward the winner is
   * itself the announcement that a new one is starting. This is just the
   * breathing room between that sweep landing and the next card leaving.
   */
  lead: 200,
};

function pauseBefore(state: DealState, peek: boolean): number {
  switch (state.phase) {
    case "draw": {
      return drawPauseBefore(drawRevealFor(state, HUMAN), peek);
    }
    case "auction": {
      return paced(PAUSE_MS.auction);
    }
    default: {
      // An empty current trick means this seat just won the last one and is
      // leading the next — see `PAUSE_MS.lead` for why that gets a shorter
      // pause than an ordinary follow.
      return paced(state.currentTrick.length === 0 ? PAUSE_MS.lead : PAUSE_MS.play);
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
        disguiseCredit: disguiseEnabled() ? DISGUISE_CREDIT_ON : 0,
        gameEquity: equityFor(boldness()),
      }),
    [],
  );
  // Read once, when the match starts. Changing the setting mid-match would move
  // the goalposts on a sitting already under way.
  const [table, setTable] = useState<TableState>(() =>
    startTable({
      format: preferredFormat(),
      seed: randomSeed(),
      // Randomized rather than always the human: every deal after this one
      // already alternates who starts — see `nextDeal` — so this is the only
      // starter in the entire match that was ever fixed rather than earned.
      starter: randomSeed() % 2 === 0 ? HUMAN : OPPONENT,
    }),
  );

  // Read on every render rather than once: unlike the bot, which would be two
  // opponents if it changed mid-rubber, pacing can change under way with no
  // consequence beyond the next animation being faster.
  setPacing(pacingFor(pace()));

  const { deal } = table;
  const waitingOnBot = deal.toAct === OPPONENT && deal.phase !== "complete";

  // Set the instant a trick resolves, however either seat gets there, and
  // cleared only by `dismissTrick` — see `GameSession.trickAwaitingDismissal`
  // for what this is guarding against. Compared against the *previous* count
  // rather than reacting to any change in it, since a new deal's count resets
  // to zero too, and that is not a trick anyone needs to be shown.
  const [awaitingDismissal, setAwaitingDismissal] = useState(false);
  const previousTrickCount = useRef(deal.completedTricks.length);
  useEffect(() => {
    const previous = previousTrickCount.current;
    previousTrickCount.current = deal.completedTricks.length;
    if (deal.completedTricks.length > previous) {
      setAwaitingDismissal(true);
    }
  }, [deal.completedTricks.length]);

  // The auction closing is the same shape as a trick resolving, for the one
  // case that leaves the bot on turn: this seat declaring, which makes the
  // bot the opening leader. `GameBoard`'s own held screen already makes a
  // human tap through that beat before the contract scrolls away — but
  // without this, that tap gated nothing here, and the bot's first card
  // could be chosen, and its sound played, while the contract was still
  // being shown.
  const previousPhase = useRef(deal.phase);
  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = deal.phase;
    if (previous === "auction" && deal.phase === "play" && deal.contract?.declarer === HUMAN) {
      setAwaitingDismissal(true);
    }
  }, [deal.contract, deal.phase]);

  const dismissTrick = useCallback(() => {
    setAwaitingDismissal(false);
  }, []);

  useEffect(() => {
    // A trick just resolved and has not been dismissed: this seat's own next
    // play is refused by `act` below regardless, but nothing there stops the
    // computer's *own* move — this is what does, so its next lead cannot
    // start before this seat has actually seen the trick it is leading past.
    if (!waitingOnBot || awaitingDismissal) {
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
    }, pauseBefore(deal, peek));

    return () => {
      clearTimeout(timer);
    };
  }, [awaitingDismissal, bot, deal, peek, table, waitingOnBot]);

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
  const achievements = useAchievementTracker();

  // Evaluated the instant a deal completes, whether or not the rubber it
  // belongs to ever does — an abandoned rubber still banks the hands played
  // inside it. `deal` is a fresh object every time `nextDeal` deals, so
  // comparing identity is enough to catch exactly the one transition into
  // "complete" without a separate counter to keep in step with the rubber.
  const processedDeal = useRef<DealState | null>(null);
  useEffect(() => {
    if (deal.phase !== "complete" || processedDeal.current === deal) {
      return;
    }
    processedDeal.current = deal;
    achievements.applyDeal(dealFacts(deal, summary.score, summary.vulnerable), HUMAN);

    // Nothing to log for a passed-out deal: no contract, no play, nothing a
    // later solver-based assessment could do anything with.
    if (!deal.passedOut && deal.contract !== null && deal.initialHands !== null) {
      void reportHandLog({
        auction: deal.auction,
        boldness: boldness(),
        botVersion: BOT_RELEASE.version,
        completedTricks: deal.completedTricks,
        contract: deal.contract,
        disguise: disguiseEnabled(),
        initialHands: deal.initialHands,
        strength: strength(),
        tricksWon: deal.tricksWon,
      });
    }
  }, [achievements, deal, summary.score, summary.vulnerable]);

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
    achievements.applyRubber(rubberFacts(summary), HUMAN);
  }, [achievements, summary.history.length, summary.rubber]);

  // A new rubber is a new thing to report. `nextDeal` starts one once the last
  // was won, which is the only way past a completed rubber.
  useEffect(() => {
    if (!summary.rubber.complete) {
      reported.current = false;
    }
  }, [summary.rubber.complete]);

  return {
    act,
    clearUnlocks: achievements.clear,
    dismissTrick,
    history: summary.history,
    justTaken:
      deal.phase === "draw" ? (deal.hands[HUMAN][deal.hands[HUMAN].length - 1] ?? null) : null,
    justUnlocked: achievements.justUnlocked,
    lastDraw: drawRevealFor(deal, HUMAN),
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
    trickAwaitingDismissal: awaitingDismissal,
    view: viewFor(deal, HUMAN),
    vulnerable: summary.vulnerable,
    waitingOnOpponent: waitingOnBot,
    // Nobody to wait for: the computer is not reading the scorepad.
    waitingToContinue: false,
  };
}
