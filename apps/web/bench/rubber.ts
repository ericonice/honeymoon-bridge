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
  Bid,
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
import { defensiveTricks, estimatedTricks } from "../src/bot/evaluate.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import type { BotTuning } from "../src/bot/heuristicBot.js";
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
 * The bidder as it was before contracts were priced in points: take the highest
 * bid the hand can expect to make, and pass when nothing qualifies.
 *
 * Kept here rather than in the bot, because it is not a bot any more — it is the
 * thing the current one has to beat. Leaving it in `heuristicBot.ts` as a mode
 * would mean shipping a second bidder nobody plays.
 */
function legacyBidder(base: Bot): Bot {
  return {
    ...base,
    chooseCall(view: PlayerView): Call {
      const calls = legalActionsForView(view).flatMap((action) =>
        action.type === "call" ? [action.call] : [],
      );
      const bids = calls.flatMap((call) => (call.type === "bid" ? [call.bid] : []));

      let best: Bid | null = null;
      for (const bid of bids) {
        if (estimatedTricks(view.hand, bid.strain) - (bid.level + 6) < 0) {
          continue;
        }
        if (best === null || bid.level > best.level) {
          best = bid;
        }
      }
      if (best !== null) {
        return { type: "bid", bid: best };
      }

      // The old rule doubled from the five level holding three defensive tricks.
      // Leaving it out made this reference unable to punish anything, which
      // quietly rigged every constant measured against it: a bot facing an
      // opponent who never doubles should of course fear doubles less and bid
      // games harder. A baseline has to be able to hurt you or it is not one.
      const entry = lastBidEntry(view.auction);
      const theirBid = entry !== null && entry.by !== view.me && entry.call.type === "bid"
        ? entry.call.bid
        : null;
      if (
        theirBid !== null &&
        theirBid.level >= 5 &&
        currentDoubling(view.auction) === "none" &&
        defensiveTricks(view.hand) >= 3 &&
        calls.some((call) => call.type === "double")
      ) {
        return { type: "double" };
      }

      return { type: "pass" };
    },
  };
}

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

function run({ gameEquity, oracle, rubbers, samples, versusWeight }: RunOptions): void {
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
  const playing = createProgress(rubbers, "rubbers");

  for (let seed = 1; seed <= rubbers; seed++) {
    // Every rubber twice with the seats exchanged, so dealing first and the
    // deal itself cannot favor either bidder.
    for (const challengerSeat of [0, 1] as const) {
      // Only the challenger takes the equity under test; the legacy reference is
      // a fixed baseline and its own bidder ignores it anyway. A head-to-head
      // reference is the same bidder, so it takes the same equity and differs
      // only in the weight being tested.
      const make = (rng: Rng, challenger: boolean): Bot =>
        challenger
          ? cardPlay(rng)
          : versusWeight === null
            ? legacyBidder(createHeuristicBot(rng))
            : cardPlay(rng, { theirBidOnOwnWeight: versusWeight });
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
    playing(seed, `${mean(points) >= 0 ? "+" : ""}${mean(points).toFixed(0)} per rubber, ${won}-${lost}`);
  }

  const margin = mean(points);
  const error = standardError(points);

  console.log(
    versusWeight === null
      ? `points bidder against the old "can I make it" bidder` +
          (samples > 0 ? `, ${samples}-sample card play` : `, heuristic card play`)
      : `the same bidder against itself trusting their bid at ${versusWeight}` +
      (samples > 0 ? `, ${samples}-sample card play` : `, heuristic card play`),
  );
  console.log(`  challenger prices a game at ${gameEquity}`);
  console.log(
    oracle
      ? `  the reference doubles off the solver, from down ${ORACLE_FROM_DOWN}`
      : `  the reference doubles only from the five level — not comparable to an oracle run`,
  );
  console.log(`${points.length} rubbers, both seats each, in ${((performance.now() - started) / 1000).toFixed(0)}s\n`);
  console.log(`  margin           ${margin >= 0 ? "+" : ""}${margin.toFixed(0)} points per rubber`);
  console.log(`  standard error   ${error.toFixed(0)}`);
  console.log(`  that is          ${(Math.abs(margin) / Math.max(1, error)).toFixed(1)} standard errors`);
  console.log(`  rubbers won      ${won} to ${lost}`);
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
const equityArg = process.argv.find((arg) => arg.startsWith("equity="));
const versusArg = process.argv.find((arg) => arg.startsWith("vs="));

run({
  gameEquity: equityArg === undefined ? DEFAULT_GAME_EQUITY : Number(equityArg.slice("equity=".length)),
  oracle: !process.argv.includes("nodouble"),
  rubbers: Number(process.argv[2] ?? 60),
  samples: Number(process.argv[3] ?? 0) || 0,
  versusWeight: versusArg === undefined ? null : Number(versusArg.slice("vs=".length)),
});
