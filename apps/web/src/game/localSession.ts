import {
  actOn,
  boardsForDeals,
  canReturn,
  createRng,
  dealFacts,
  currentDeal,
  dealOf,
  drawRevealFor,
  nextIn,
  ownDrawPairFor,
  randomSeed,
  returnMatch,
  rubberFacts,
  sortHand,
  startMatch,
  summarizeMatch,
  viewFor,
} from "@hb/engine";
import type { Card, DealAction, DealState, MatchState, Pair, PlayerId } from "@hb/engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_GAME_EQUITY } from "../bot/bidValue.js";
import { DISGUISE_CREDIT_ON } from "../bot/heuristicBot.js";
import { levelFor } from "../bot/difficulty.js";
import { botForLevel } from "../bot/build.js";
import { useAchievementTracker } from "./achievements.js";
import { botActionFor } from "./botTurn.js";
import { reportHandLog } from "./handLog.js";
import {
  boldness,
  difficulty,
  preferredRelease,
  disguiseEnabled,
  pace,
  mirrorHalfFormat,
  preferredFormat,
  sessionDeals,
  sessionOrder,
} from "./identity.js";
import { reportRobotRubber } from "./records.js";
import type { GameSession } from "./session.js";
import { drawPauseBefore, paced, setPacing } from "./timing.js";

/**
 * What identifies the board on the table, for the computer's memory of it.
 *
 * The deal's own seed, in both formats, because that is what a board *is* — and
 * because keying on it gives the one behaviour wanted for free: a board's second
 * run carries the same seed as its first, so `boardOffers` keeps the record of the
 * first run and the replay does not overwrite it with a record of the half already
 * spent.
 *
 * Null before anything has been dealt, which cannot happen, and is handled rather
 * than asserted because the alternative is a crash on the first draw turn.
 */
function boardKeyOf(match: MatchState): number | null {
  if (match.kind === "duplicate") {
    return match.session.boards[currentDeal(match.session).board]?.seed ?? null;
  }
  return match.table.dealt[match.table.dealt.length - 1]?.seed ?? null;
}

/**
 * How long a solve must have taken before the computer says it is thinking.
 *
 * Short enough that a real wait is explained, long enough that ordinary play never
 * flickers a word nobody has time to read. A second is where a pause stops reading as
 * pacing and starts reading as a stall — below it the deliberate delay before the
 * computer moves is doing the same job already.
 */
const SLOW_ENOUGH_TO_SAY = 1000;

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
 * beside what uses it.
 *
 * `samplesFor` used to live here and is gone: the difficulty rung owns the sample
 * count now, along with recall and the search budget, so a second mapping from
 * `strength` would be a second answer to a question that has one.
 */

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
  return level === "fast" ? 0.6 : level === "slow" ? 1.5 : 1;
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
  // Read once, when the match starts, for the same reason the format is: an
  // opponent that changed how hard it played halfway through a rubber would be
  // two opponents in one match, and the version and difficulty both travel with
  // every record the match produces.
  const release = useMemo(() => preferredRelease(), []);
  // The rung itself, not just what it resolves to. Both the hand log and the
  // rubber report name it, and re-reading the setting per deal would let a match
  // record two different opponents if somebody changed it mid-rubber.
  const rung = useMemo(() => difficulty(), []);
  const level = useMemo(() => levelFor(rung), [rung]);
  const bot = useMemo(
    () =>
      botForLevel({
        level,
        rng: createRng(randomSeed()),
        // The release, then the rung, then the player's own dials. What the
        // opponent *is*, then how hard it is asked to play, then the leftovers
        // from before difficulty existed — `strength` is gone, since the rung
        // owns the sample count now.
        tuning: {
          ...release.tuning,
          ...level.tuning,
          disguiseCredit: disguiseEnabled() ? DISGUISE_CREDIT_ON : 0,
          gameEquity: equityFor(boldness()),
        },
      }),
    [level, release],
  );
  /**
   * The seed the deal on the table was dealt from, kept for the hand log.
   *
   * Deliberately here rather than on `DealState`, which is the shape `viewFor`
   * projects from: a seed reconstructs the entire stock order, so a field holding
   * one inside the deal would be a leak waiting for somebody to forget to strip
   * it. This is the browser's own record of what it dealt, and it goes to the
   * server only once the deal is over and there is nothing left to spoil.
   */
  const dealSeed = useRef(randomSeed());
  /**
   * What the computer was offered on each board it has finished, so it can recognise a
   * board that comes round again.
   *
   * Here rather than on `DealState` for the reason `dealSeed` is: that shape is what
   * `viewFor` projects from, and a pairing of cards inside it would be a leak waiting
   * for somebody to forget to strip it. This is the host's own note of what the bot
   * saw, handed back to it explicitly — which is the rule the `Bot` interface has
   * always stated, and what keeps a forgetful opponent a matter of passing less.
   *
   * `inPlay` is the deal being played *now*, held aside and committed only when it
   * finishes. Without that the bot would be handed a partial record of the board in
   * front of it and try to identify itself by it.
   */
  const boardOffers = useRef(new Map<number, readonly Pair<Card>[]>());
  const inPlay = useRef<{ board: number; pairs: Pair<Card>[] } | null>(null);

  // Read once, when the match starts. Changing the setting mid-match would move
  // the goalposts on a sitting already under way.
  const [match, setMatch] = useState<MatchState>(() =>
    startMatch({
      // In deals, which is what the player chose, converted where the two units
      // meet rather than doubled here.
      boards: boardsForDeals(sessionDeals()),
      schedule: sessionOrder(),
      // Where a session's board numbers begin. Random for now, which is the
      // honest version until a catalogue exists: nobody is being scored against
      // a field yet, so what matters is only that a session's boards are
      // recorded, and `dealSeed` is what records them.
      firstBoard: randomSeed() % 1_000_000,
      format: preferredFormat(),
      // Only a mirror reads it; every other format's length is its format.
      halfFormat: mirrorHalfFormat(),
      seed: dealSeed.current,
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

  const deal = dealOf(match);
  const summary = summarizeMatch(match);
  const board = match.kind === "duplicate" ? currentDeal(match.session).board : null;
  const waitingOnBot = deal.toAct === OPPONENT && deal.phase !== "complete";

  // Set the instant a trick resolves, however either seat gets there, and
  // cleared only by `dismissTrick` — see `GameSession.trickAwaitingDismissal`
  // for what this is guarding against. Compared against the *previous* count
  // rather than reacting to any change in it, since a new deal's count resets
  // to zero too, and that is not a trick anyone needs to be shown.
  const [awaitingDismissal, setAwaitingDismissal] = useState(false);
  /**
   * The computer is working out its move right now, as opposed to merely being on turn.
   *
   * Distinct from "it is their turn", which is already drawn and which covers the
   * deliberate pause before they move as well as the thinking itself. This is only the
   * part where the app is unresponsive, which is the part a player needs explaining.
   */
  const [thinking, setThinking] = useState(false);
  /**
   * How long the computer's last solve took at each position, keyed by cards in hand.
   *
   * **The indicator has to be predicted, not observed, and this is why.** The solver
   * runs synchronously on the main thread, so once it starts nothing can measure it
   * and repaint: a timer set for a second cannot fire until the work it was timing has
   * finished, by which point saying "thinking" would be a flash after the fact. The
   * only way to have the word on screen *during* a long solve is to decide before
   * starting that this one will be long.
   *
   * Cards in hand is the key because it is what the cost turns on — a solve with
   * thirteen cards and nothing played is the dearest of the deal, and each trick makes
   * the next one cheaper. Measured rather than modelled, so it is right on whatever
   * device it is running on and at whatever sample count the rung asks for, instead of
   * resting on a constant fitted to this laptop.
   *
   * The cost is that the *first* solve at a given size is never announced, however slow
   * it turns out to be — including the opening lead of the first deal, which is the one
   * that prompted this. From the second deal on it is right. Worth stating plainly
   * rather than hiding: a worker is the fix that would make this reactive, and this is
   * not that.
   */
  const solveTimes = useRef(new Map<number, number>());
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
      // Announced only where the last solve of this size was slow enough to be worth
      // explaining — see `solveTimes`. A fast move pays nothing for this: no flag, no
      // yielded frame, no flicker of a word that would be gone before it was read.
      const size = deal.hands[OPPONENT].length;
      const slow = (solveTimes.current.get(size) ?? 0) >= SLOW_ENOUGH_TO_SAY;

      // **Say it, then let the browser paint before blocking.** A flag set immediately
      // before the solve never reaches the screen: the frame that would draw it is the
      // frame the solve is blocking, so it would go up and come down without ever being
      // painted. The yield costs about 16ms, invisible inside a pause already being
      // waited out, and it is the difference between an indicator and a no-op.
      const run = (): void => {
        const began = performance.now();
      // The action is chosen out here rather than inside the updater: the bot's
      // generator is stateful, and React may call an updater more than once.
      // What this turn offered the computer, noted before the turn consumes it. Keyed
      // by which of its own draw turns this is, so a re-render that reaches here twice
      // overwrites rather than appends.
      if (board !== null && deal.phase === "draw" && deal.pending !== null) {
        const second = deal.stock[0];
        if (second !== undefined) {
          if (inPlay.current?.board !== board) {
            inPlay.current = { board, pairs: [] };
          }
          const turn = deal.drawTurns.filter((one) => one.by === OPPONENT).length;
          inPlay.current.pairs[turn] = [deal.pending, second];
        }
      }

      const action = botActionFor({
        boards: [...boardOffers.current].map(([one, offers]) => ({ board: one, offers })),
        bot,
        seat: OPPONENT,
        standing: summary.botStanding,
        state: deal,
      });
        solveTimes.current.set(size, performance.now() - began);
        setThinking(false);
        setMatch((current) => (current === match ? actOn(current, OPPONENT, action) : current));
      };

      if (slow) {
        setThinking(true);
        requestAnimationFrame(run);
      } else {
        run();
      }
    }, pauseBefore(deal, peek));

    return () => {
      clearTimeout(timer);
    };
  }, [awaitingDismissal, bot, deal, match, peek, summary.botStanding, waitingOnBot]);

  const act = useCallback((action: DealAction) => {
    setMatch((current) => (dealOf(current).toAct === HUMAN ? actOn(current, HUMAN, action) : current));
  }, []);

  const skipPhase = useCallback(() => {
    const phase = dealOf(match).phase;
    if (phase === "complete") {
      return;
    }
    // Resolved out here rather than inside the updater: the bot's generator is
    // stateful, and React may call an updater more than once.
    let next = match;
    while (dealOf(next).phase === phase) {
      const state = dealOf(next);
      const action = botActionFor({
        bot,
        seat: state.toAct,
        standing: summarizeMatch(next).botStanding,
        state,
      });
      next = actOn(next, state.toAct, action);
    }
    setMatch(next);
  }, [bot, match]);

  /**
   * The same boards back, with the right to draw first swapped.
   *
   * Deliberately does *not* clear `boardOffers`, which is the one thing that makes a
   * return match interesting for the computer: on its hardest setting it meets every
   * board having already been offered the other half of it. `advance` clears, because
   * a fresh rubber shares nothing with the one before it.
   */
  const playSameBoards = useCallback(() => {
    setMatch(returnMatch(match));
  }, [match]);

  const advance = useCallback(() => {
    // A finished session is followed by a fresh set of boards, so what the computer
    // remembers of the old ones goes. Not housekeeping: a person does not carry a
    // board across sessions either, and leaving it would make the memory grow for as
    // long as the tab is open in exchange for records that can never match again.
    if (summarizeMatch(match).complete) {
      boardOffers.current.clear();
    }
    dealSeed.current = randomSeed();
    // `randomSeed` is not pure, so the deal is dealt out here rather than
    // inside an updater React may call more than once. A session ignores the
    // seed — it already knows every board it is going to play.
    setMatch(nextIn(match, dealSeed.current));
  }, [match]);

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

    // The finished deal's offers become memory. Only the *first* run of a board is
    // kept: by the time the second is over the board is done and will not come round
    // again, so overwriting would replace a useful record with a spent one.
    const noted = inPlay.current;
    if (noted !== null && noted.pairs.length === 13 && !boardOffers.current.has(noted.board)) {
      boardOffers.current.set(noted.board, noted.pairs);
    }
    inPlay.current = null;

    // Nothing to log for a passed-out deal: no contract, no play, nothing a
    // later solver-based assessment could do anything with.
    //
    // Duplicate deals go in now that the log can say what they were bid at. It could
    // not before — `standing` was a rubber, and a session has none — and sending a
    // fresh one would have put a standing that never existed into stored data, which
    // is how a bench comes to report a figure describing neither of two games.
    if (!deal.passedOut && deal.contract !== null && deal.initialHands !== null) {
      reportHandLog({
        auction: deal.auction,
        boldness: boldness(),
        botVersion: release.version,
        completedTricks: deal.completedTricks,
        contract: deal.contract,
        disguise: disguiseEnabled(),
        drawTurns: deal.drawTurns,
        initialHands: deal.initialHands,
        seed: dealSeed.current,
        format: summary.format,
        // The score the deal was *bid* at, which is not the score it left behind.
        // Without it a replayed auction is a different decision from the one that
        // was taken — `bidValue` prices every call against the standing, so a
        // part-score or a game in hand changes the answer.
        //
        // A session has no rubber, and the omission is the fact rather than a
        // missing field: what a duplicate call is priced against is vulnerability,
        // which a board prescribes, and that is here either way.
        standing: {
          ...(summary.standing.kind === "rubber"
            ? { rubber: summary.botStanding.rubber }
            : {}),
          vulnerable: summary.vulnerable,
        },
        starter: deal.starter,
        // Which rung produced this deal. `strength` stays beside it because the
        // server has a column for it and older builds still send one, but the rung
        // is what decides the sample count, the recall and the search budget — a
        // log naming only the old dial would describe a bot nobody played.
        difficulty: rung,
        tricksWon: deal.tricksWon,
      });
    }
  }, [achievements, deal, summary.score, summary.vulnerable]);

  // Reported the moment the match is decided rather than when the player taps
  // on, because tapping on is optional: closing the tab on a won rubber is a
  // perfectly ordinary way to finish, and it would otherwise go unrecorded.
  //
  // A drawn match is reported too, which it was not at first. `results` had no way
  // to say nobody won, and duplicate turned that from a curiosity into an ordinary
  // outcome: a board is flat whenever both of its runs score the same, so a short
  // session is level a fair fraction of the time — and a match somebody played
  // going missing is the failure `outbox.ts` exists to prevent. A rubber can tie on
  // exactly equal totals as well, and that was silently unrecorded.
  const reported = useRef(false);
  useEffect(() => {
    if (!summary.complete || reported.current) {
      return;
    }
    reported.current = true;
    reportRobotRubber({
      botVersion: release.version,
      deals: summary.dealsPlayed,
      difficulty: rung,
      format: summary.format,
      points: summary.points[HUMAN],
      pointsAgainst: summary.points[OPPONENT],
      repeated: summary.repeated,
      drawn: summary.winner === null,
      won: summary.winner === HUMAN,
    });
    // Rubber achievements are about a rubber. Taking the rubber cannot be earned
    // in a session and must not fire in one — which is the whole reason this is
    // gated on the standing's shape rather than on the match merely finishing.
    if (summary.standing.kind === "rubber") {
      achievements.applyRubber(
        rubberFacts({
          history: summary.standing.history,
          rubber: summary.standing.rubber,
          score: summary.score,
          vulnerable: summary.vulnerable,
        }),
        HUMAN,
      );
    }
  }, [achievements, summary.complete, summary.dealsPlayed, summary.winner]);

  // A new match is a new thing to report. `nextDeal` starts a fresh rubber once
  // the last was won, which is the only way past a completed one.
  useEffect(() => {
    if (!summary.complete) {
      reported.current = false;
    }
  }, [summary.complete]);

  return {
    act,
    clearUnlocks: achievements.clear,
    dealBonus: summary.bonus,
    dealsPlayed: summary.dealsPlayed,
    dismissTrick,
    format: summary.format,
    justTaken:
      deal.phase === "draw" ? (deal.hands[HUMAN][deal.hands[HUMAN].length - 1] ?? null) : null,
    justUnlocked: achievements.justUnlocked,
    lastDraw: drawRevealFor(deal, HUMAN),
    lastTrick: deal.completedTricks[deal.completedTricks.length - 1] ?? null,
    halfComplete: summary.halfComplete,
    winner: summary.winner,
    nextDeal: advance,
    thinking,
    playSameBoards: canReturn(match) ? playSameBoards : null,
    repeated: summary.repeated,
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
    matchComplete: summary.complete,
    score: summary.score,
    standing: summary.standing,
    skipPhase,
    trickAwaitingDismissal: awaitingDismissal,
    view: viewFor(deal, HUMAN),
    vulnerable: summary.vulnerable,
    waitingOnOpponent: waitingOnBot,
    // Nobody to wait for: the computer is not reading the scorepad.
    waitingToContinue: false,
  };
}
