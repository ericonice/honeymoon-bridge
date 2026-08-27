import {
  applyTableAction,
  createRng,
  currentDoubling,
  lastBidEntry,
  legalActions,
  legalActionsForView,
  nextDeal,
  opponentOf,
  scoreDeal,
  startTable,
  summarize,
  totalScore,
  viewFor,
  vulnerability,
} from "@hb/engine";
import type {
  Call,
  Card,
  DealAction,
  DealState,
  MatchFormat,
  Pair,
  PlayerId,
  PlayerView,
  Rng,
  Strain,
} from "@hb/engine";
import { DEFAULT_GAME_EQUITY } from "../src/bot/bidValue.js";
import type { Objective } from "../src/bot/bidValue.js";
import { DIFFICULTIES, DIFFICULTY_LABEL, levelFor } from "../src/bot/difficulty.js";
import type { DifficultyLevel } from "../src/bot/difficulty.js";
import { releaseFor } from "../src/bot/release.js";
import type { BotRelease } from "../src/bot/release.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import type { BotTuning } from "../src/bot/heuristicBot.js";
import { botForLevel } from "../src/bot/build.js";
import { simpleBidder } from "../src/bot/simpleBidder.js";
import { createSamplingBot } from "../src/bot/samplingBot.js";
import { solve } from "../src/bot/solver.js";
import type { BoardMemory, Bot } from "../src/bot/types.js";
import { offeredSoFar, offersFacingOpponent } from "../src/bot/boardRecall.js";
import { botActionFor } from "../src/game/botTurn.js";
import { actOn, currentDeal, dealOf, nextIn, startMatch, summarizeMatch } from "@hb/engine";
import { createProgress } from "./progress.js";

/**
 * Two bidders across full rubbers, which is the only bench that can see what a
 * bidder is for.
 *
 * Every other bench here plays deals in isolation, at love all. That is fine for
 * card play, which does not care what the score is, and useless for bidding,
 * which cares about almost nothing else: stretching for game, sacrificing to
 * deny one, and pricing a vulnerable penalty are all invisible when every deal
 * starts and ends at nil. A bidder measured that way is being marked on the one
 * part of its job it does not do.
 *
 * Card play is held fixed and by default deliberately cheap — both sides use the
 * heuristic rather than the sampling bot. It cancels between the two seats
 * anyway, and it is a hundred times faster, which is what makes enough rubbers
 * affordable to separate two bidders at all.
 *
 * Pass a sample count to play the cards properly instead. That is far slower and
 * is needed for exactly one question: **only the sampler reads the auction**, so
 * anything whose value is that the other seat believed something — bidding
 * unpredictably above all — is invisible while the heuristic is holding the
 * cards. A bench where nobody can be fooled will always report that the
 * ambiguity does not pay.
 *
 * The reference doubles off the solver by default — see `oracleDouble`. Add
 * `nodouble` to restore the old five-level-only reference, which is the opponent
 * every margin recorded before this was measured against.
 *
 * `equity=550` measures the bidder the app actually ships, and `vs=0` replaces the
 * legacy reference with this same bidder at a different trust weight — see
 * `RunOptions.versusWeight` for why that is a different question.
 *
 *   npm run bench:rubber --workspace @hb/web -- [rubbers] [samples] [nodouble] [equity=N]
 */

const MAX_DEALS = 60;


/**
 * Undertricks the oracle needs to see before it doubles.
 *
 * The same number as `DOUBLED_FROM_DOWN` in `bidValue.ts`, and that is the whole
 * point rather than a coincidence. The bot's bidding assumes it gets doubled
 * exactly when it is going down two or more; against this reference that
 * assumption is *true*, so anything it still loses to a double is a wrong trick
 * estimate rather than a wrong model of the opponent. Isolating those two was
 * impossible while the reference only doubled from the five level.
 */
const ORACLE_FROM_DOWN = 2;

/**
 * A double from a seat that can see both hands, used as a measuring instrument
 * and never as a player.
 *
 * This deliberately does not live in a `Bot`, and it is handed the `DealState`
 * rather than a `PlayerView` — which is exactly why it cannot be one. `solver.ts`
 * may never be given a position for a seat that is thinking, so the intercept
 * sits here in the bench, above the bot, and overrides the call it would have
 * made. A bot that could reach this would be a bot that cheats.
 *
 * Why an oracle rather than a stronger heuristic doubler: a heuristic one shares
 * the estimator's blind spots, so it fails to punish precisely the hands the
 * estimator misreads — which is the failure it is being built to catch. Recorded
 * games showed six of eight disasters doubled at the *four* level, all of them
 * invisible to a reference that starts at five.
 *
 * One solve per (declarer, strain) per deal. The cache is passed in rather than
 * closed over, because the hands are only final once the draw has ended and a
 * cache built any earlier would answer from a hand of the wrong size.
 */
function oracleDouble(
  state: DealState,
  seat: PlayerId,
  cache: Map<string, number>,
): DealAction | null {
  if (state.phase !== "auction" || currentDoubling(state.auction) !== "none") {
    return null;
  }
  const entry = lastBidEntry(state.auction);
  if (entry === null || entry.by === seat || entry.call.type !== "bid") {
    return null;
  }
  if (
    !legalActions(state, seat).some(
      (action) => action.type === "call" && action.call.type === "double",
    )
  ) {
    return null;
  }

  const declarer = entry.by;
  const { level, strain } = entry.call.bid;
  return level + 6 - solvedTricks(state, declarer, strain, cache) >= ORACLE_FROM_DOWN
    ? { type: "call", call: { type: "double" } }
    : null;
}

function solvedTricks(
  state: DealState,
  declarer: PlayerId,
  strain: Strain,
  cache: Map<string, number>,
): number {
  const key = `${declarer}${strain}`;
  const known = cache.get(key);
  if (known !== undefined) {
    return known;
  }
  const solved = solve({
    hands: [state.hands[0], state.hands[1]],
    leader: opponentOf(declarer),
    strain,
    trick: [],
  }).tricks[declarer];
  cache.set(key, solved);
  return solved;
}

interface Outcome {
  readonly deals: number;
  /**
   * Deals where the challenger could tell which board it was on.
   *
   * Reported because a knob whose effect on behavior has never been observed is not
   * yet a knob — the rule this directory opens with, and one this bench has broken
   * before by spending two hundred rubbers comparing a psych setting against itself.
   * Memory can only bite through the sampler, so an arm run at zero samples and no
   * bid search would be two identical bots and would measure as a clean null.
   */
  readonly recognised: number;
  /** Deals the oracle doubled in. A knob whose firing has never been observed is not yet a knob. */
  readonly doubles: number;
  readonly points: Pair<number>;
  /**
   * Deals the challenger declared and went down two or more, and what its
   * doubled contracts cost it.
   *
   * The margin alone cannot settle how far to trust their bid, because the
   * reference bids the highest contract it thinks it can make and so overclaims
   * systematically — believing it less is correct against *this* opponent and
   * wrong against a person who bids soundly. These two do not care how good the
   * reference is: they count what the challenger walked into, against the solver.
   */
  readonly wrecks: number;
  readonly wreckPoints: number;
  readonly winner: PlayerId | null;
}

interface MatchOptions {
  readonly bots: Pair<Bot>;
  /**
   * Seats that carry what they were offered from one board to its replay.
   *
   * A bench arm rather than a permanent property, because this is the one capability
   * where the bot and the person are structurally unequal: both hands are face up by
   * the end of every deal, so a computer that keeps the pairs recognises a board
   * perfectly and a person recognises it vaguely. What that is worth is a number
   * nobody had, and pooling an arm that has it with one that does not would be the
   * instrument failure this whole directory exists to avoid.
   */
  readonly boardMemory: Pair<boolean>;
  /** The seat whose disasters are counted. */
  readonly challenger: PlayerId;
  readonly format: MatchFormat;
  /** The seat whose doubles come from the solver, or null for neither. */
  readonly oracleSeat: PlayerId | null;
  readonly seed: number;
}

/**
 * One match, through the same machine the app plays.
 *
 * It drives `game/match.ts` rather than keeping its own rubber loop, which is the
 * lesson `bot/build.ts` already taught from the other side: this bench once
 * branched to the heuristic bot at zero samples while the app did not, so a rung
 * measured as one opponent and shipped as another with nothing in the types saying
 * so. A bench with its own copy of the match machine can measure a format the app
 * plays differently, and would not say so either.
 */
function playMatch({ boardMemory, bots, challenger, format, oracleSeat, seed }: MatchOptions): Outcome {
  // Recorded exactly as `localSession` records it: read off `pending` and the top of
  // the stock before the turn spends them, held aside for the deal in progress, and
  // committed when it finishes. A bench that recorded it some other way would be
  // measuring a capability the app does not ship.
  const recalled: Pair<Map<number, readonly Pair<Card>[]>> = [new Map(), new Map()];
  const noting: Pair<{ board: number; pairs: Pair<Card>[] } | null> = [null, null];
  const memoryOf = (seat: PlayerId): BoardMemory =>
    boardMemory[seat]
      ? [...recalled[seat]].map(([board, offers]) => ({ board, offers }))
      : [];
  const rng = createRng(seed);
  // Board numbers spaced well apart, so no two seeds share a board and a session
  // is a fresh set of stocks. Both seat-exchanged runs of one seed get the same
  // boards, which is what makes the pairing a pairing.
  let match = startMatch({ firstBoard: seed * 1000, format, seed, starter: 0 });
  let deals = 0;
  let doubles = 0;
  let recognised = 0;
  let wrecks = 0;
  let wreckPoints = 0;

  while (deals < MAX_DEALS) {
    const solved = new Map<string, number>();
    // Hoisted out of the action loop: the standing a call is priced against is
    // fixed for the whole of a deal, in both formats — a rubber reads the rubber
    // as it stood when the deal began, and a session reads the board's prescribed
    // vulnerability.
    const standing = summarizeMatch(match).botStanding;
    let asked = false;
    while (dealOf(match).phase !== "complete") {
      const deal = dealOf(match);
      const seat = deal.toAct;
      const board = match.kind === "duplicate" ? currentDeal(match.session).board : null;
      if (board !== null && deal.phase === "draw" && deal.pending !== null && deal.stock[0] !== undefined) {
        if (noting[seat]?.board !== board) {
          noting[seat] = { board, pairs: [] };
        }
        noting[seat]!.pairs[deal.drawTurns.filter((one) => one.by === seat).length] = [
          deal.pending,
          deal.stock[0],
        ];
      }
      // Asked once a deal, of the challenger, off exactly what the bot is handed —
      // **at the first call rather than at the deal's first action.** Asking earlier is
      // what the first version did and it reported 0 of 480: during the draw the seat
      // has been offered almost nothing, so there is nothing to identify a board by.
      // A census taken at the wrong moment reads exactly like a capability that does
      // not work, which is the failure this bench keeps finding in its own read-outs.
      if (!asked && boardMemory[challenger] && deal.phase === "auction") {
        asked = true;
        const seen = offeredSoFar(viewFor(deal, challenger), deal.discards[challenger]);
        if (offersFacingOpponent(memoryOf(challenger), seen) !== null) {
          recognised += 1;
        }
      }
      const forced = seat === oracleSeat ? oracleDouble(deal, seat, solved) : null;
      if (forced !== null) {
        doubles += 1;
      }
      match = actOn(
        match,
        seat,
        forced ??
          botActionFor({ boards: memoryOf(seat), bot: bots[seat]!, seat, standing, state: deal }),
      );
    }

    deals += 1;
    // Only the first run of a board is kept: by the time the second is over the board
    // is spent, so overwriting would replace a useful record with a useless one.
    for (const seat of [0, 1] as const) {
      const noted = noting[seat];
      if (noted !== null && noted.pairs.length === 13 && !recalled[seat].has(noted.board)) {
        recalled[seat].set(noted.board, noted.pairs);
      }
      noting[seat] = null;
    }
    const wreck = wreckIn(dealOf(match), challenger);
    wrecks += wreck.down ? 1 : 0;
    wreckPoints += wreck.cost;
    const summary = summarizeMatch(match);
    if (summary.complete) {
      return {
        deals,
        doubles,
        recognised,
        points: summary.points,
        winner: summary.winner,
        wreckPoints,
        wrecks,
      };
    }
    match = nextIn(match, Math.floor(rng.next() * 0xffffffff));
  }

  return {
    deals,
    doubles,
    points: summarizeMatch(match).points,
    recognised,
    winner: null,
    wreckPoints,
    wrecks,
  };
}

/** A contract this seat declared and went down two or more in, and what it paid above the line. */
function wreckIn(state: DealState, seat: PlayerId): { cost: number; down: boolean } {
  const contract = state.contract;
  if (contract === null || contract.declarer !== seat || state.initialHands === null) {
    return { cost: 0, down: false };
  }
  const undertricks = contract.level + 6 - state.tricksWon[seat];
  if (undertricks < ORACLE_FROM_DOWN) {
    return { cost: 0, down: false };
  }
  const score = scoreDeal(
    { contract, hands: [state.initialHands[0], state.initialHands[1]], tricksWon: state.tricksWon },
    [false, false],
  );
  return { cost: score.aboveLine[opponentOf(seat)], down: true };
}

/**
 * A win rate and how unsure it is, with two imagined wins and two imagined
 * losses folded in before the error bar is taken.
 *
 * The textbook binomial error collapses to *exactly zero* at a clean sweep, which
 * is the single most misleading thing a bench in here can print: the opening
 * rubbers of a lopsided run read as "0% ± 0", a measurement claiming no
 * uncertainty at all. Worse, the headline divides by this to report standard
 * errors — so a run where one side swept would have announced half a billion of
 * them, off a guard against dividing by zero. The padding makes an early number
 * look as unsettled as it is, and washes out entirely by the time the count
 * matters.
 *
 * One function for the running tally and for the headline, because they are the
 * same claim at two moments and a bench whose progress line and whose conclusion
 * disagree is one nobody can read.
 */
function winRate(won: number, lost: number): {
  readonly error: number;
  readonly gap: number;
  readonly rate: number;
} {
  const decided = won + lost;
  const padded = (won + 2) / (decided + 4);
  return {
    error: Math.sqrt((padded * (1 - padded)) / (decided + 4)),
    // What this win rate is worth as a rating difference, which is the number
    // that actually gets typed into `DIFFICULTY_OFFSETS` and `BOT_RATINGS`.
    // Computed here because it was being worked out by hand off the printed
    // percentage every time, and a constant table filled in by hand arithmetic
    // is a constant table with a mistake in it. Taken off the padded rate rather
    // than the raw one so a clean sweep gives a large number instead of an
    // infinite one.
    gap: 400 * Math.log10(padded / (1 - padded)),
    rate: decided === 0 ? 0.5 : won / decided,
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function standardError(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const average = mean(values);
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

interface RunOptions {
  /**
   * What the challenger prices a game at.
   *
   * Worth naming rather than leaving at the default, because the default is not
   * what anybody plays against: `identity.ts` returns bold for a fresh install
   * and `localSession.ts` maps that to 550. Every margin recorded here before now
   * was measured on a bidder nobody sits opposite.
   */
  readonly gameEquity: number;
  /** False restores the old reference, which only doubled from the five level. */
  readonly oracle: boolean;
  /**
   * What the challenger prices calls in.
   *
   * With `equity` the reference becomes *this same bidder pricing in points*,
   * which is v3 against v2 with everything else held identical — the only
   * comparison that answers whether the objective is an improvement. The legacy
   * "can I make it" bidder cannot answer it: it is a worse opponent than either,
   * so both would beat it and the margin between them would be swamped.
   */
  readonly objective: Objective;
  /**
   * What the two bidders are playing.
   *
   * A duplicate session is the one format where the *reference* has to be this
   * same bidder pricing in points rather than the legacy "can I make it" one: the
   * question is whether pricing a call in duplicate scoring beats pricing it in
   * rubber points, and the legacy bidder is a worse opponent than either, so it
   * would lose to both and the margin between them would be swamped.
   */
  readonly format: MatchFormat;
  /**
   * Both seats get the challenger's exact tuning, which must come out at even.
   *
   * **There was no way to ask for this and there should have been.** Every other
   * mode picks a *different* reference — the legacy bidder, an older release, the
   * same bidder at another trust weight — so "two of the same" was unreachable, and
   * the nearest thing to it silently answered another question: the first attempt
   * at a duplicate control passed `objective=points`, which selects the legacy "can
   * I make it" bidder, and came back **84.8% over 80 sessions**. A control that is
   * not a control is worse than none, and this file has already recorded the oracle
   * doubler reading 61.8% between two identical bidders for want of one.
   *
   * In duplicate it is an unusually sharp check: two identical bidders on one stock
   * should not merely score evenly, every single board should be flat.
   */
  readonly control: boolean;
  /**
   * Which seats carry a board's pairs into its replay: neither, the challenger, or
   * both.
   *
   * `memory` gives it to the challenger alone, which is the arm that prices the
   * capability. `memory=both` is what a bot-against-bot session looks like when
   * *neither* side has the human disadvantage, and is the honest control for it —
   * asking whether the format is still fair when both seats recognise every board.
   *
   * Duplicate only. A rubber never replays a stock, so there is nothing to recognise
   * and the flag would silently do nothing.
   */
  readonly memory: "both" | "challenger" | "none";
  /**
   * Two releases to play against each other, challenger first.
   *
   * The point of keeping a superseded release playable, and the reason it does not
   * have to be *frozen*: card play is shared, so a fix there changes both sides of
   * a comparison — but a margin that can be re-measured on demand needs no
   * freezing. A number quoted from before such a change is history; this is how to
   * get it back.
   *
   * Prefer this to `objective=`, which compares one pricing against another and
   * only happens to name v3 against v2 for as long as that is the only thing
   * separating them.
   */
  readonly releases: Pair<BotRelease> | null;
  /** Milliseconds the challenger may spend searching for a trick distribution. Zero is off. */
  readonly search: number;
  /** Two difficulty rungs to play against each other, challenger first. */
  readonly levels: Pair<DifficultyLevel> | null;
  /** `mean` takes the search's centre and keeps the fitted spread; `odds` takes both. */
  readonly searchMode: "mean" | "odds";
  readonly rubbers: number;
  readonly samples: number;
  /**
   * When set, the reference is this same bidder trusting their bid by this much
   * instead of the legacy "can I make it" one.
   *
   * The legacy reference bids the highest contract it estimates it can make, so
   * its bids overclaim by about half a trick systematically — which makes it the
   * wrong opponent for fitting how far to trust a bid, and it will always report
   * that trusting one less is better. Against a bidder whose claims are as honest
   * as this one's, the same question has a different and more useful answer.
   */
  readonly versusWeight: number | null;
}

/** Whether a seat carries what it was offered from a board into that board's replay. */
function remembers(seat: PlayerId, challengerSeat: PlayerId, memory: RunOptions["memory"]): boolean {
  return memory === "both" || (memory === "challenger" && seat === challengerSeat);
}

function run({
  control,
  format,
  memory,
  gameEquity,
  objective,
  oracle,
  levels,
  releases,
  rubbers,
  samples,
  search,
  searchMode,
  versusWeight,
}: RunOptions): void {
  const tuning = { gameEquity };
  const cardPlay = (rng: Rng, extra: BotTuning = {}): Bot =>
    samples > 0
      ? createSamplingBot(rng, samples, { ...tuning, ...extra })
      : createHeuristicBot(rng, { ...tuning, ...extra });

  const points: number[] = [];
  const dealCounts: number[] = [];
  const doubleCounts: number[] = [];
  const wreckCounts: number[] = [];
  const wreckCosts: number[] = [];
  let won = 0;
  let recognitions = 0;
  let dealsPlayed = 0;
  let lost = 0;
  const started = performance.now();
  // Twenty seconds with heuristic card play and several minutes with the
  // sampler, so this reports either way rather than only when it is slow —
  // a bench that goes quiet exactly when it is expensive is the wrong way round.
  // Twice the seed count, because every seed is played twice with the seats
  // exchanged. This said `rubbers N/20` while counting seeds, so a tally of 5-5
  // sat beside a counter reading 5 — which made a careful reader stop and check
  // the arithmetic rather than read the result. The summary has always been
  // right; only the progress line was lying about its unit.
  // Named for what is actually being played. A read-out calling a session a
  // rubber is the same class of mistake as the progress line that counted seeds
  // and said "rubbers" — the summary was right and only the label lied, which is
  // exactly the sort of thing that makes a careful reader stop and re-derive.
  const noun = format === "duplicate" ? "sessions" : "rubbers";
  const playing = createProgress(rubbers * 2, noun);

  for (let seed = 1; seed <= rubbers; seed++) {
    // Every rubber twice with the seats exchanged, so dealing first and the
    // deal itself cannot favor either bidder.
    for (const challengerSeat of [0, 1] as const) {
      // Only the challenger takes the equity under test; the legacy reference is
      // a fixed baseline and its own bidder ignores it anyway. A head-to-head
      // reference is the same bidder, so it takes the same equity and differs
      // only in the weight being tested.
      const make = (rng: Rng, challenger: boolean): Bot => {
        if (levels !== null) {
          // A rung against a rung, which is the only way to price the ladder. The
          // number each level shows in Settings should be the one this produced.
          const level = levels[challenger ? 0 : 1];
          return botForLevel({ level, rng, tuning: { ...tuning, ...level.tuning } });
        }
        if (search > 0) {
          // The same bidder, one side searching for its trick distribution and
          // the other counting it. Everything else is held identical, which is
          // the only way to price the search itself.
          return challenger
            ? cardPlay(rng, {
                objective,
                searchBudgetMs: search,
                searchMode: searchMode === "mean" ? "mean" : "odds",
                searchSamples: 25,
              })
            : cardPlay(rng, { objective });
        }
        if (releases !== null) {
          return cardPlay(rng, releases[challenger ? 0 : 1].tuning);
        }
        if (control) {
          return cardPlay(rng, { objective });
        }
        return challenger
          ? cardPlay(rng, { objective })
          : versusWeight !== null
            ? cardPlay(rng, { theirBidOnOwnWeight: versusWeight })
            : objective === "points"
              ? simpleBidder(createHeuristicBot(rng))
              : // Anything that is not the points objective is measured *against*
                // it, which is the only comparison that says whether the pricing
                // is an improvement rather than merely different.
                cardPlay(rng, { objective: "points" });
      };
      const bots: Pair<Bot> = [
        make(createRng(seed), challengerSeat === 0),
        make(createRng(seed), challengerSeat === 1),
      ];

      const them = challengerSeat === 0 ? 1 : 0;
      const outcome = playMatch({
        boardMemory: [
          remembers(0, challengerSeat, memory),
          remembers(1, challengerSeat, memory),
        ],
        bots,
        challenger: challengerSeat,
        format,
        oracleSeat: oracle ? them : null,
        seed,
      });
      points.push(outcome.points[challengerSeat] - outcome.points[them]);
      dealCounts.push(outcome.deals);
      doubleCounts.push(outcome.doubles);
      wreckCounts.push(outcome.wrecks);
      wreckCosts.push(outcome.wreckPoints);
      recognitions += outcome.recognised;
      dealsPlayed += outcome.deals;
      if (outcome.winner === challengerSeat) {
        won += 1;
      } else if (outcome.winner === them) {
        lost += 1;
      }
    }
    // The tally with its error bar, so the number can be watched settling rather
    // than believed early. A win rate wanders wildly over the first dozen rubbers
    // and the bar is what says so — reading a result into that wander is a mistake
    // this file has recorded more than once.
    const { error: bar, rate } = winRate(won, lost);
    playing(
      seed * 2,
      `${won}-${lost}  ${(100 * rate).toFixed(0)}% ± ${(100 * bar).toFixed(0)}  ` +
        `${mean(points) >= 0 ? "+" : ""}${mean(points).toFixed(0)}/${noun.slice(0, -1)}`,
    );
  }

  const margin = mean(points);
  const error = standardError(points);

  const play = samples > 0 ? `, ${samples}-sample card play` : `, heuristic card play`;
  console.log(
    control
      ? `one bidder against an exact copy of itself, pricing in ${objective} — the control${play}`
      : format === "duplicate" && objective === "duplicate"
        ? `duplicate scoring against the same bidder pricing in rubber points, over sessions${play}`
        : levels !== null
      ? `${levelName(levels[0])} against ${levelName(levels[1])}, their own sample counts`
      : search > 0
        ? `the bidder searching its tricks at ${search}ms (${searchMode}) against the same bidder counting them${play}`
        : releases !== null
        ? `v${releases[0].version} ${releases[0].name} against v${releases[1].version} ${releases[1].name}${play}`
            : versusWeight !== null
            ? `the same bidder against itself trusting their bid at ${versusWeight}${play}`
            : objective === "equity"
              ? `the equity objective against the same bidder pricing in points${play}`
              : `points bidder against the old "can I make it" bidder${play}`,
  );
  console.log(`  challenger prices a game at ${gameEquity}`);
  if (memory !== "none") {
    console.log(
      memory === "both"
        ? "  both seats carry a board's pairs into its replay"
        : "  the challenger carries a board's pairs into its replay; the reference does not",
    );
    console.log(
      `  it knew which board it was on in ${((100 * recognitions) / Math.max(dealsPlayed, 1)).toFixed(0)}% ` +
        `of deals (${recognitions} of ${dealsPlayed})`,
    );
  }
  console.log(
    oracle
      ? `  the reference doubles off the solver, from down ${ORACLE_FROM_DOWN}`
      : `  the reference doubles only from the five level — not comparable to an oracle run`,
  );
  console.log(
    `${points.length} ${noun}, both seats each, in ${((performance.now() - started) / 1000).toFixed(0)}s
`,
  );
  // Rubbers won leads, and the reason is not presentation. A bidder maximizing
  // the chance of taking the rubber will trade points for wins — conceding 200 to
  // protect a rubber it is winning is the whole point of it — so a bench headlined
  // on points per rubber would report exactly that as a regression. This file has
  // recorded three instrument failures of that shape; this one was predictable.
  const { error: rateError, gap, rate } = winRate(won, lost);
  console.log(
    `  ${noun} won${" ".repeat(Math.max(1, 14 - noun.length))}${won} to ${lost}   ` +
      `${(100 * rate).toFixed(1)}% ± ${(100 * rateError).toFixed(1)}`,
  );
  console.log(
    `  that is          ${(Math.abs(rate - 0.5) / rateError).toFixed(1)} standard errors from even`,
  );
  console.log(
    `  worth            ${gap >= 0 ? "+" : ""}${gap.toFixed(0)} rating points to the challenger`,
  );
  console.log(
    `  margin           ${margin >= 0 ? "+" : ""}${margin.toFixed(0)} points per ${noun.slice(0, -1)}`,
  );
  console.log(`  standard error   ${error.toFixed(0)}`);
  console.log(`  that is          ${(Math.abs(margin) / Math.max(1, error)).toFixed(1)} standard errors`);
  console.log(`  deals per ${noun.slice(0, -1)}  ${mean(dealCounts).toFixed(1)}`);
  console.log(
    `  doubles          ${mean(doubleCounts).toFixed(2)} per ${noun.slice(0, -1)}, ` +
      `${(mean(doubleCounts) / Math.max(0.01, mean(dealCounts)) * 100).toFixed(0)}% of deals`,
  );
  console.log(
    `  challenger down 2+ in its own contract, ${mean(wreckCounts).toFixed(2)} deals per ${noun.slice(0, -1)} ` +
      `(${(mean(wreckCounts) / Math.max(0.01, mean(dealCounts)) * 100).toFixed(0)}% of deals), ` +
      `costing ${mean(wreckCosts).toFixed(0)} per ${noun.slice(0, -1)}`,
  );
}

// The oracle is the default because the five-level-only reference is what hid
// four-level disasters in the first place; `nodouble` restores it for comparing
// against a margin recorded before this existed.
/**
 * `releases=3:2` plays one release against another, challenger first.
 *
 * Both must be in the registry, which is what makes this possible at all — see
 * `release.ts` on why a superseded release stays playable.
 */
function releasesFrom(arg: string | undefined): Pair<BotRelease> | null {
  if (arg === undefined) {
    return null;
  }
  const [first, second] = arg.slice("releases=".length).split(":");
  const challenger = releaseFor(Number(first));
  const reference = releaseFor(Number(second));
  if (challenger === null || reference === null) {
    throw new Error(`releases=${first}:${second} names a version this build does not have`);
  }
  return [challenger, reference];
}

/**
 * `levels=kitchen:championship` plays one rung against another, challenger first.
 *
 * Either side may also be spelled out as `recall/samples/search` — so
 * `levels=3/60/250:championship` is Championship with only its memory taken away.
 * That is what prices a *lever* rather than a rung, and the ladder needs it:
 * Kitchen differs from Club in recall, sample count and search budget all at
 * once, so measuring the pair says the bottom of the ladder is real and says
 * nothing about which of the three made it real. A rung is three levers moved
 * together and a ladder built on the wrong one saturates, which is exactly what
 * happened at the top.
 *
 * `0` samples means no solver at all — heuristic card play. See `botForLevel`,
 * which is where that stopped being a landmine.
 */
function levelsFrom(arg: string | undefined): Pair<DifficultyLevel> | null {
  if (arg === undefined) {
    return null;
  }
  const [first, second] = arg.slice("levels=".length).split(":");
  return [levelFromName(first), levelFromName(second)];
}

function levelFromName(name: string | undefined): DifficultyLevel {
  const found = DIFFICULTIES.find((one) => one === name);
  if (found !== undefined) {
    return levelFor(found);
  }
  if (name !== undefined && name.includes("/")) {
    const [recall, samples, search] = name.split("/").map(Number);
    if ([recall, samples, search].every((one) => one !== undefined && Number.isFinite(one))) {
      return {
        // A spelled-out triple is always the priced bidder. The simple one is a
        // property of the Kitchen rung rather than a lever on a scale, so it is
        // named rather than dialled: `levels=kitchen:championship`.
        bidding: "priced",
        recall: recall!,
        samples: samples!,
        // A budget of zero has to mean *no search*, not a search with no time —
        // `searchBudgetMs: 0` reads as falsy everywhere downstream, but leaving
        // the key present is one more thing for a future reader to check.
        tuning: search! > 0 ? { searchBudgetMs: search!, searchSamples: 25 } : {},
      };
    }
  }
  throw new Error(
    `levels= wants two of ${DIFFICULTIES.join(", ")}, or a recall/samples/search triple like 3/60/250`,
  );
}

function levelName(level: DifficultyLevel): string {
  const found = DIFFICULTIES.find((one) => levelFor(one) === level);
  if (found !== undefined) {
    return DIFFICULTY_LABEL[found];
  }
  const search = level.tuning.searchBudgetMs ?? 0;
  const play = level.samples === 0 ? "no solver" : `${level.samples} samples`;
  return `recall ${level.recall}, ${play}, ${search === 0 ? "no search" : `${search}ms search`}`;
}

const equityArg = process.argv.find((arg) => arg.startsWith("equity="));
const versusArg = process.argv.find((arg) => arg.startsWith("vs="));

/**
 * `format=duplicate` plays sessions instead of rubbers.
 *
 * It carries the objective with it, because in duplicate they are the same
 * question: a session has no standing, so pricing a call the rubber way is
 * pricing it against a standing that will never change. Pass `objective=points`
 * as well to hold both sides on the points objective, which is the **control** —
 * two identical bidders on the same stock must come out at even, and in duplicate
 * that is unusually sharp, since every board should be flat.
 */
const format: MatchFormat = process.argv.includes("format=duplicate") ? "duplicate" : "rubber";
const objective: Objective = process.argv.includes("objective=points")
  ? "points"
  : process.argv.includes("objective=equity")
    ? "equity"
    : format === "duplicate"
      ? "duplicate"
      : "points";

run({
  control: process.argv.includes("control"),
  format,
  memory: process.argv.includes("memory=both")
    ? "both"
    : process.argv.includes("memory")
      ? "challenger"
      : "none",
  gameEquity: equityArg === undefined ? DEFAULT_GAME_EQUITY : Number(equityArg.slice("equity=".length)),
  objective,
  levels: levelsFrom(process.argv.find((arg) => arg.startsWith("levels="))),
  releases: releasesFrom(process.argv.find((arg) => arg.startsWith("releases="))),
  search: Number(process.argv.find((arg) => arg.startsWith("search="))?.slice("search=".length) ?? 0),
  searchMode: process.argv.includes("mean") ? "mean" : "odds",
  oracle: !process.argv.includes("nodouble"),
  rubbers: Number(process.argv[2] ?? 60),
  samples: Number(process.argv[3] ?? 0) || 0,
  versusWeight: versusArg === undefined ? null : Number(versusArg.slice("vs=".length)),
});
