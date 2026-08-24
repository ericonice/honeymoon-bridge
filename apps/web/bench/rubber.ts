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
  vulnerability,
} from "@hb/engine";
import type {
  Call,
  DealAction,
  DealState,
  Pair,
  PlayerId,
  PlayerView,
  Rng,
  Strain,
  TableState,
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
import type { Bot } from "../src/bot/types.js";
import { botActionFor } from "../src/game/botTurn.js";
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

interface RubberOptions {
  readonly bots: Pair<Bot>;
  /** The seat whose disasters are counted. */
  readonly challenger: PlayerId;
  /** The seat whose doubles come from the solver, or null for neither. */
  readonly oracleSeat: PlayerId | null;
  readonly seed: number;
}

function playRubber({ bots, challenger, oracleSeat, seed }: RubberOptions): Outcome {
  const rng = createRng(seed);
  let table: TableState = startTable({ seed, starter: 0 });
  let deals = 0;
  let doubles = 0;
  let wrecks = 0;
  let wreckPoints = 0;

  while (deals < MAX_DEALS) {
    const solved = new Map<string, number>();
    while (table.deal.phase !== "complete") {
      const seat = table.deal.toAct;
      const forced =
        seat === oracleSeat ? oracleDouble(table.deal, seat, solved) : null;
      if (forced !== null) {
        doubles += 1;
      }
      table = applyTableAction(
        table,
        seat,
        forced ??
          botActionFor({
            bot: bots[seat],
            seat,
            standing: {
              rubber: table.rubberBefore,
              vulnerable: vulnerability(table.rubberBefore),
            },
            state: table.deal,
          }),
      );
    }

    deals += 1;
    const wreck = wreckIn(table.deal, challenger);
    wrecks += wreck.down ? 1 : 0;
    wreckPoints += wreck.cost;
    const summary = summarize(table);
    if (summary.rubber.complete) {
      return {
        deals,
        doubles,
        points: totalScore(summary.rubber),
        winner: summary.rubber.winner,
        wreckPoints,
        wrecks,
      };
    }
    table = nextDeal(table, Math.floor(rng.next() * 0xffffffff));
  }

  const summary = summarize(table);
  return { deals, doubles, points: totalScore(summary.rubber), winner: null, wreckPoints, wrecks };
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

function run({
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
  const playing = createProgress(rubbers * 2, "rubbers");

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
        return challenger
          ? cardPlay(rng, { objective })
          : versusWeight !== null
            ? cardPlay(rng, { theirBidOnOwnWeight: versusWeight })
            : objective === "equity"
              ? cardPlay(rng, { objective: "points" })
              : simpleBidder(createHeuristicBot(rng));
      };
      const bots: Pair<Bot> = [
        make(createRng(seed), challengerSeat === 0),
        make(createRng(seed), challengerSeat === 1),
      ];

      const them = challengerSeat === 0 ? 1 : 0;
      const outcome = playRubber({
        bots,
        challenger: challengerSeat,
        oracleSeat: oracle ? them : null,
        seed,
      });
      points.push(outcome.points[challengerSeat] - outcome.points[them]);
      dealCounts.push(outcome.deals);
      doubleCounts.push(outcome.doubles);
      wreckCounts.push(outcome.wrecks);
      wreckCosts.push(outcome.wreckPoints);
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
        `${mean(points) >= 0 ? "+" : ""}${mean(points).toFixed(0)}/rubber`,
    );
  }

  const margin = mean(points);
  const error = standardError(points);

  const play = samples > 0 ? `, ${samples}-sample card play` : `, heuristic card play`;
  console.log(
    levels !== null
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
  console.log(
    oracle
      ? `  the reference doubles off the solver, from down ${ORACLE_FROM_DOWN}`
      : `  the reference doubles only from the five level — not comparable to an oracle run`,
  );
  console.log(`${points.length} rubbers, both seats each, in ${((performance.now() - started) / 1000).toFixed(0)}s\n`);
  // Rubbers won leads, and the reason is not presentation. A bidder maximizing
  // the chance of taking the rubber will trade points for wins — conceding 200 to
  // protect a rubber it is winning is the whole point of it — so a bench headlined
  // on points per rubber would report exactly that as a regression. This file has
  // recorded three instrument failures of that shape; this one was predictable.
  const { error: rateError, gap, rate } = winRate(won, lost);
  console.log(`  rubbers won      ${won} to ${lost}   ${(100 * rate).toFixed(1)}% ± ${(100 * rateError).toFixed(1)}`);
  console.log(
    `  that is          ${(Math.abs(rate - 0.5) / rateError).toFixed(1)} standard errors from even`,
  );
  console.log(
    `  worth            ${gap >= 0 ? "+" : ""}${gap.toFixed(0)} rating points to the challenger`,
  );
  console.log(`  margin           ${margin >= 0 ? "+" : ""}${margin.toFixed(0)} points per rubber`);
  console.log(`  standard error   ${error.toFixed(0)}`);
  console.log(`  that is          ${(Math.abs(margin) / Math.max(1, error)).toFixed(1)} standard errors`);
  console.log(`  deals per rubber ${mean(dealCounts).toFixed(1)}`);
  console.log(
    `  doubles          ${mean(doubleCounts).toFixed(2)} per rubber, ` +
      `${(mean(doubleCounts) / Math.max(0.01, mean(dealCounts)) * 100).toFixed(0)}% of deals`,
  );
  console.log(
    `  challenger down 2+ in its own contract, ${mean(wreckCounts).toFixed(2)} deals per rubber ` +
      `(${(mean(wreckCounts) / Math.max(0.01, mean(dealCounts)) * 100).toFixed(0)}% of deals), ` +
      `costing ${mean(wreckCosts).toFixed(0)} per rubber`,
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

run({
  gameEquity: equityArg === undefined ? DEFAULT_GAME_EQUITY : Number(equityArg.slice("equity=".length)),
  objective: process.argv.includes("objective=equity") ? "equity" : "points",
  levels: levelsFrom(process.argv.find((arg) => arg.startsWith("levels="))),
  releases: releasesFrom(process.argv.find((arg) => arg.startsWith("releases="))),
  search: Number(process.argv.find((arg) => arg.startsWith("search="))?.slice("search=".length) ?? 0),
  searchMode: process.argv.includes("mean") ? "mean" : "odds",
  oracle: !process.argv.includes("nodouble"),
  rubbers: Number(process.argv[2] ?? 60),
  samples: Number(process.argv[3] ?? 0) || 0,
  versusWeight: versusArg === undefined ? null : Number(versusArg.slice("vs=".length)),
});
