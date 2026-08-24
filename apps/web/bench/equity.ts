import {
  applyDealScore,
  applyTableAction,
  createRng,
  newRubber,
  nextDeal,
  scoreDeal,
  startTable,
  summarize,
  totalScore,
  vulnerability,
} from "@hb/engine";
import type { Card, MatchFormat, Pair, PlayerId, RubberState, TableState } from "@hb/engine";
import { readFileSync } from "node:fs";
import { DEFAULT_GAME_EQUITY } from "../src/bot/bidValue.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { createSamplingBot } from "../src/bot/samplingBot.js";
import type { Bot } from "../src/bot/types.js";
import { botActionFor } from "../src/game/botTurn.js";

/**
 * What a standing is worth, measured rather than reasoned.
 *
 * `bidValue.ts` prices a call by how far it moves the score, plus a flat
 * `DEFAULT_GAME_EQUITY` for holding a game and a fraction of it for a
 * part-score. That constant was derived by hand — three-in-four of a bonus
 * averaging six hundred — and its own comment names what the derivation leaves
 * out: winning a game also makes you vulnerable, which is a real future cost
 * that nothing charges for.
 *
 * A single scalar cannot express any of that. It prices the second game the same
 * as the first, when the second ends the rubber and banks its bonus; it prices a
 * part-score the same whether the side holding it is ahead or behind; and it has
 * no way to say a game is worth more when the opponent already has one.
 *
 * So this measures it. Play rubbers, record the standing at the start of every
 * deal, label each with who eventually won, and fit the probability of winning
 * from there. That probability is the currency a bidder should be maximising —
 * points are only the means — and the non-linearity comes out of the fit rather
 * than out of an argument.
 *
 *   npm run bench:equity --workspace @hb/web -- 1500 [samples]
 *
 * About a minute for 1500 rubbers, which is 23,000 standings and plenty. The
 * state space is four cells and not a big table — a side holding two games has
 * finished the rubber, so games won is 0 or 1 each, and two of the four cells are
 * mirror images of one another. That is small enough to print, which is the
 * reason this is a fitted table rather than a model of anything.
 *
 * Heuristic card play by default, the same default `bench/rubber.ts` has: a
 * sample count makes it solver-backed and far slower, and what a *standing*
 * converts into is dominated by the scoring structure rather than by the last
 * trick of finesse. Pass one to check that claim rather than assuming it.
 *
 * **This fit is circular, and that is the thing to watch.** The rubbers are
 * played by the bidder whose objective this would become, so the table describes
 * how *this* bidder converts a standing. The honest handling is to fit, swap it
 * in, refit, and report whether the coefficients moved. The calibration in
 * `evaluate.ts` was circular twice before anybody noticed, and it cost an
 * afternoon each time.
 */

/** Long enough that a rubber which has not finished is one nobody would sit through. */
const MAX_DEALS = 60;

/** Below-the-line points that win a game, so a part-score reads as a fraction of one. */
const GAME_THRESHOLD = 100;

/**
 * One deal-start standing, from one seat's point of view, with what became of it.
 *
 * Recorded from *both* seats for every standing, which doubles the rows and costs
 * nothing: the two are mirror images, so a fit that comes out asymmetric is
 * reporting a bug rather than a discovery. That is the cheapest check available
 * here, and the states below are grouped so it can be read straight off.
 */
interface Sample {
  /** This seat's games, then theirs — the state the fit is split by. */
  readonly games: Pair<number>;
  /** Total points, this seat's way, in hundreds. Part-score points are inside it. */
  readonly margin: number;
  /** Progress toward the game in play, this seat's way, as a fraction of a game. */
  readonly part: number;
  /** +1 for the person's seat, -1 for the computer's, 0 when both seats are one bot. */
  readonly person: number;
  readonly won: number;
}

function sampleFrom(rubber: RubberState, seat: PlayerId, won: number, person = 0): Sample {
  const them: PlayerId = seat === 0 ? 1 : 0;
  const total = totalScore(rubber);
  return {
    games: [rubber.gamesWon[seat]!, rubber.gamesWon[them]!],
    margin: (total[seat]! - total[them]!) / GAME_THRESHOLD,
    part: (rubber.partScore[seat]! - rubber.partScore[them]!) / GAME_THRESHOLD,
    person,
    won,
  };
}

/**
 * One rubber, keeping every standing it passed through.
 *
 * `rubberBefore` is what a deal was bid at — the same thing `botActionFor` is
 * handed — so it is the standing a decision was actually taken from, and the only
 * one an equity table can honestly be indexed by.
 */
function playRubber(bots: Pair<Bot>, seed: number, format: MatchFormat): readonly Sample[] {
  const rng = createRng(seed);
  let table: TableState = startTable({ format, seed, starter: 0 });
  const standings: RubberState[] = [];

  for (let deals = 0; deals < MAX_DEALS; deals++) {
    standings.push(table.rubberBefore);
    while (table.deal.phase !== "complete") {
      const seat = table.deal.toAct;
      table = applyTableAction(
        table,
        seat,
        botActionFor({
          bot: bots[seat],
          seat,
          standing: { rubber: table.rubberBefore, vulnerable: vulnerability(table.rubberBefore) },
          state: table.deal,
        }),
      );
    }
    const summary = summarize(table);
    if (summary.rubber.complete) {
      const winner = summary.rubber.winner;
      if (winner === null) {
        return [];
      }
      return standings.flatMap((rubber) => [
        sampleFrom(rubber, 0, winner === 0 ? 1 : 0),
        sampleFrom(rubber, 1, winner === 1 ? 1 : 0),
      ]);
    }
    table = nextDeal(table, Math.floor(rng.next() * 0xffffffff));
  }

  // A rubber nobody won says nothing about winning one.
  return [];
}

/**
 * Rubbers rebuilt out of the hand log, so recorded games can be fitted from.
 *
 * The log records the standing each deal was *bid* at and never who eventually
 * took the rubber, which is the label a fit needs. So the deals are chained: sort
 * by when they were played, start a rubber at a standing that is untouched, fold
 * each deal's score in with the engine, and close the rubber when that completes
 * it. Every standing in a closed rubber then carries the outcome.
 *
 * The chain is *checked* rather than trusted. The score computed after one deal
 * has to equal the standing the next deal says it was bid at, and where it does
 * not — a deal that never reached the server, a record reset, a rubber still in
 * progress when the log ends — the whole rubber is dropped and counted. A run of
 * deals that merely looks continuous is exactly how a table would get fitted
 * against standings that never happened.
 */
interface Rebuilt {
  readonly dropped: number;
  readonly rubbers: number;
  readonly samples: readonly Sample[];
}

function sameStanding(one: RubberState, two: RubberState): boolean {
  return (
    one.gamesWon[0] === two.gamesWon[0] &&
    one.gamesWon[1] === two.gamesWon[1] &&
    one.partScore[0] === two.partScore[0] &&
    one.partScore[1] === two.partScore[1] &&
    one.aboveLine[0] === two.aboveLine[0] &&
    one.aboveLine[1] === two.aboveLine[1] &&
    one.belowLineTotal[0] === two.belowLineTotal[0] &&
    one.belowLineTotal[1] === two.belowLineTotal[1]
  );
}

function untouched(rubber: RubberState): boolean {
  return sameStanding(rubber, newRubber(rubber.format));
}

function rebuildFromLog(path: string): Rebuilt {
  const logged = (JSON.parse(readFileSync(path, "utf8")) as any[])
    .filter((hand) => hand.deal?.standing !== undefined && hand.deal?.contract !== null)
    .sort((one, two) => one.playedAt - two.playedAt);

  const samples: Sample[] = [];
  let rubbers = 0;
  let dropped = 0;
  let open: RubberState[] = [];
  let expected: RubberState | null = null;

  const abandon = (): void => {
    if (open.length > 0) {
      dropped += 1;
    }
    open = [];
    expected = null;
  };

  for (const hand of logged) {
    const deal = hand.deal;
    const before = deal.standing.rubber as RubberState;

    if (expected === null ? !untouched(before) : !sameStanding(before, expected)) {
      // Either a rubber that started mid-flight or a gap in what was recorded.
      abandon();
      if (!untouched(before)) {
        continue;
      }
    }

    const hands: Pair<readonly Card[]> = [deal.initialHands[0], deal.initialHands[1]];
    const after = applyDealScore(
      before,
      scoreDeal({ contract: deal.contract, hands, tricksWon: deal.tricksWon }, deal.standing.vulnerable),
    );
    open = [...open, before];

    if (after.complete) {
      const winner = after.winner;
      if (winner !== null) {
        rubbers += 1;
        for (const standing of open) {
          // Seat 0 is the person and seat 1 the computer in every robot game.
          samples.push(sampleFrom(standing, 0, winner === 0 ? 1 : 0, 1));
          samples.push(sampleFrom(standing, 1, winner === 1 ? 1 : 0, -1));
        }
      }
      open = [];
      expected = null;
      continue;
    }
    expected = after;
  }
  abandon();
  return { dropped, rubbers, samples };
}

interface Fit {
  /** Being in this state at an even score, in log-odds. Zero for a symmetric state. */
  readonly base: number;
  readonly baseError: number;
  readonly margin: number;
  /**
   * Standard errors, and they are the reason this interface has them at all.
   *
   * The first version of this bench reported the level state's margin coefficient
   * as +0.01 off 1500 rubbers and +0.08 off 3000, and I wrote the first of those
   * down as a finding — "points that are not progress toward a game are worth
   * nothing" — when it was a number with an error bar wide enough to contain
   * both. A coefficient without one is an invitation to do that again.
   *
   * These are the naive errors off the inverse Hessian and they are *optimistic*:
   * every standing inside one rubber shares that rubber's outcome, so the rows
   * are correlated and the effective sample is nearer the rubber count than the
   * row count. Treat them as a lower bound, and treat agreement between two
   * sample sizes as the real check.
   */
  readonly marginError: number;
  readonly part: number;
  readonly partError: number;
  readonly rows: number;
  /**
   * How much stronger the person is than the computer, in log-odds, or null when
   * both seats are the same bot.
   *
   * Only meaningful for a fit over recorded games, and it is the whole reason such
   * a fit needs its own term. Between two copies of one bidder a standing is all
   * there is to explain the result. Between a person winning 24 rubbers in 27 and
   * a bot, most of the result is *who is playing*, and a table that left that out
   * would read the skill gap into the value of a part-score.
   *
   * Antisymmetric like everything else here — the feature is +1 for the person's
   * row and -1 for the computer's — so the two seats' chances still sum to one.
   */
  readonly strength: number | null;
  readonly strengthError: number | null;
  readonly won: number;
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

/** Gaussian elimination with partial pivoting, for the Newton step below. */
function solve(matrix: number[][], rhs: number[]): number[] {
  const size = rhs.length;
  const rows = matrix.map((row, index) => [...row, rhs[index]!]);
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(rows[row]![col]!) > Math.abs(rows[pivot]![col]!)) {
        pivot = row;
      }
    }
    const swap = rows[col]!;
    rows[col] = rows[pivot]!;
    rows[pivot] = swap;
    const lead = rows[col]![col]!;
    for (let row = 0; row < size; row++) {
      if (row === col) {
        continue;
      }
      const factor = rows[row]![col]! / lead;
      for (let k = col; k <= size; k++) {
        rows[row]![k] = rows[row]![k]! - factor * rows[col]![k]!;
      }
    }
  }
  return rows.map((row, index) => row[size]! / row[index]!);
}

/**
 * Logistic regression on an intercept, the part-score and the margin.
 *
 * Newton's method rather than gradient descent: three parameters make each step a
 * three-by-three solve, it converges in a handful of iterations, and it needs no
 * learning rate for somebody to get wrong later. The ridge on the diagonal is
 * there for a state whose rows are nearly separable, not for regularisation.
 */
function fit(samples: readonly Sample[], withStrength = false): Fit {
  const features = (one: Sample): number[] =>
    withStrength ? [1, one.part, one.margin, one.person] : [1, one.part, one.margin];
  const size = withStrength ? 4 : 3;
  let beta = new Array<number>(size).fill(0);
  let hessian: number[][] = [];

  for (let step = 0; step < 25; step++) {
    hessian = Array.from({ length: size }, (_unused, i) =>
      Array.from({ length: size }, (_also, j) => (i === j ? 1e-6 : 0)),
    );
    const gradient = new Array<number>(size).fill(0);
    for (const one of samples) {
      const row = features(one);
      const chance = sigmoid(row.reduce((total, value, index) => total + value * beta[index]!, 0));
      const weight = chance * (1 - chance);
      for (let i = 0; i < size; i++) {
        gradient[i] = gradient[i]! + (one.won - chance) * row[i]!;
        for (let j = 0; j < size; j++) {
          hessian[i]![j] = hessian[i]![j]! + weight * row[i]! * row[j]!;
        }
      }
    }
    const delta = solve(hessian, gradient);
    beta = beta.map((value, index) => value + delta[index]!);
    if (delta.every((one) => Math.abs(one) < 1e-9)) {
      break;
    }
  }

  // The inverse Hessian's diagonal, one unit vector at a time.
  const error = (index: number): number => {
    const unit = new Array<number>(size).fill(0);
    unit[index] = 1;
    return Math.sqrt(Math.max(0, solve(hessian, unit)[index]!));
  };
  return {
    base: beta[0]!,
    baseError: error(0),
    margin: beta[2]!,
    marginError: error(2),
    part: beta[1]!,
    partError: error(1),
    rows: samples.length,
    strength: withStrength ? beta[3]! : null,
    strengthError: withStrength ? error(3) : null,
    won: samples.reduce((total, one) => total + one.won, 0),
  };
}

/** The games states, named the way somebody at the table would name them. */
const STATES: readonly { games: Pair<number>; label: string }[] = [
  { games: [0, 0], label: "no games yet" },
  { games: [1, 0], label: "a game up" },
  { games: [0, 1], label: "a game down" },
  { games: [1, 1], label: "one game each" },
];

/**
 * A one-game match has exactly one standing to be in.
 *
 * Winning a game *is* winning the match, so nobody is ever a game up and nobody is
 * ever vulnerable — the only state that exists is nothing-to-nothing, and the whole
 * table for that format is two coefficients. Which is why applying the rubber
 * numbers to it would have been inventing them rather than approximating them: it
 * is not a shorter rubber, it is a game whose bonus is paid on the spot.
 */
const GAME_STATES: readonly { games: Pair<number>; label: string }[] = [
  { games: [0, 0], label: "nothing to nothing" },
];

function inState(samples: readonly Sample[], games: Pair<number>): Sample[] {
  return samples.filter((one) => one.games[0] === games[0] && one.games[1] === games[1]);
}

function signed(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/** The chance of winning from a state, at an even score with no part-score. */
function evenMoney(one: Fit): number {
  return sigmoid(one.base);
}

/**
 * Deliberately not reported in points, and the first attempt was.
 *
 * The obvious presentation is "what is a game worth in points", by dividing the
 * gap between two states by the coefficient on the margin. It is unusable: at no
 * games each that coefficient is **+0.01 per hundred points**, so the ratio
 * divides by something indistinguishable from zero and reports a game as worth
 * anything between five hundred and two thousand depending on the sample.
 *
 * That near-zero is not noise, it is the finding. With no game won, banked points
 * barely predict taking the rubber — the 500 or 700 for winning it swamps them,
 * and points that are not progress toward a game do not bring it closer. Which is
 * the whole objection to the current objective: `bidValue.ts` prices every call
 * in points, and at the commonest standing in the game a point of score is worth
 * almost nothing toward the only thing being played for.
 *
 * So everything below is in equity, where the numbers are stable and mean what
 * they say.
 */
function equityAt(one: Fit, part: number, margin: number): number {
  return sigmoid(one.base + one.part * part + one.margin * margin);
}

function report(samples: readonly Sample[], withStrength = false, states = STATES): void {
  console.log(`${samples.length} deal-start standings from finished rubbers, both seats' view of each`);
  console.log();
  console.log("Winning the rubber from here, fitted per games state");
  console.log("  state              rows     won       even score    per part-score    per 100 points");

  const fits = new Map<string, Fit>();
  for (const state of states) {
    const rows = inState(samples, state.games);
    if (rows.length < 50) {
      console.log(`  ${state.label.padEnd(19)}${String(rows.length).padStart(5)}    too few to fit`);
      continue;
    }
    const one = fit(rows, withStrength);
    fits.set(state.label, one);
    console.log(
      `  ${state.label.padEnd(19)}${String(one.rows).padStart(5)}   ${(one.won / one.rows).toFixed(3)}   ` +
        `${`${signed(one.base)} ± ${one.baseError.toFixed(2)}`.padStart(15)}   ` +
        `${`${signed(one.part)} ± ${one.partError.toFixed(2)}`.padStart(15)}   ` +
        `${`${signed(one.margin)} ± ${one.marginError.toFixed(2)}`.padStart(15)}`,
    );
    if (one.strength !== null && one.strengthError !== null) {
      console.log(
        `  ${"".padEnd(19)}      the person is ${signed(one.strength)} ± ${one.strengthError.toFixed(2)} stronger, in log-odds`,
      );
    }
  }

  const level = fits.get("no games yet");
  const up = fits.get("a game up");
  const down = fits.get("a game down");
  const each = fits.get("one game each");

  console.log();
  console.log("Checks that do not depend on the model being right");
  if (level !== undefined) {
    console.log(
      `  ${"a level standing is even money".padEnd(42)}${(level.won / level.rows).toFixed(3)} won, fitted ${sigmoid(level.base).toFixed(3)}`,
    );
  }
  if (each !== undefined) {
    console.log(
      `  ${"one game each is even money".padEnd(42)}${(each.won / each.rows).toFixed(3)} won, fitted ${sigmoid(each.base).toFixed(3)}`,
    );
  }
  if (up !== undefined && down !== undefined) {
    // Mirror images of one state. If these disagree, the rows are wrong rather
    // than the world, which is the whole reason both seats are recorded.
    console.log(
      `  ${"a game up mirrors a game down".padEnd(42)}${sigmoid(up.base).toFixed(3)} against ${(1 - sigmoid(down.base)).toFixed(3)}`,
    );
  }

  console.log();
  console.log("What an advantage is worth, in chance of taking the rubber");
  if (level !== undefined && up !== undefined) {
    console.log(
      `  ${"winning the first game".padEnd(42)}${evenMoney(level).toFixed(3)} to ${evenMoney(up).toFixed(3)}   ` +
        `${signed(evenMoney(up) - evenMoney(level), 3)}`,
    );
  }
  if (down !== undefined && each !== undefined) {
    console.log(
      `  ${"equalising, when they hold one".padEnd(42)}${evenMoney(down).toFixed(3)} to ${evenMoney(each).toFixed(3)}   ` +
        `${signed(evenMoney(each) - evenMoney(down), 3)}`,
    );
  }
  if (level !== undefined) {
    console.log(
      `  ${"a 60 part-score, from level".padEnd(42)}${evenMoney(level).toFixed(3)} to ${equityAt(level, 0.6, 0.6).toFixed(3)}   ` +
        `${signed(equityAt(level, 0.6, 0.6) - evenMoney(level), 3)}`,
    );
  }
  if (each !== undefined) {
    console.log(
      `  ${"a 60 part-score, at one game each".padEnd(42)}${evenMoney(each).toFixed(3)} to ${equityAt(each, 0.6, 0.6).toFixed(3)}   ` +
        `${signed(equityAt(each, 0.6, 0.6) - evenMoney(each), 3)}`,
    );
  }

  console.log();
  console.log(`What the current objective would say, at DEFAULT_GAME_EQUITY = ${DEFAULT_GAME_EQUITY}`);
  for (const state of states) {
    const one = fits.get(state.label);
    if (one === undefined) {
      continue;
    }
    // The flat constant is added to a points total, so its worth in equity is
    // whatever that state's points coefficient makes of it. Where that is near
    // zero the constant is being added to a currency that does not buy the game.
    const asEquity = equityAt(one, 0, DEFAULT_GAME_EQUITY / GAME_THRESHOLD) - evenMoney(one);
    console.log(
      `  ${`${DEFAULT_GAME_EQUITY} points, ${state.label}`.padEnd(42)}${signed(asEquity, 3)} equity   ` +
        `(${signed(one.margin)} per 100 points)`,
    );
  }

  console.log();
  console.log("The table, to paste into src/bot/equity.ts");
  console.log("  Antisymmetry is imposed there rather than fitted — the features are already this");
  console.log("  seat's way, so a symmetric state has no intercept and a game up is the negative of");
  console.log("  a game down. The fitted numbers below agree with that, which is the check, not the");
  console.log("  source: a bidder relies on equity(me) + equity(them) being exactly one.");
  const single = fits.get("nothing to nothing");
  if (single !== undefined) {
    console.log(`    game: { margin: ${single.margin.toFixed(4)}, part: ${single.part.toFixed(4)} },`);
    console.log(`  the one state a short match has, fitted base ${single.base.toFixed(4)} against an imposed zero`);
  }
  if (level !== undefined && up !== undefined && each !== undefined) {
    console.log(`    gameLead: ${up.base.toFixed(4)},`);
    console.log(`    level: { margin: ${level.margin.toFixed(4)}, part: ${level.part.toFixed(4)} },`);
    console.log(`    oneEach: { margin: ${each.margin.toFixed(4)}, part: ${each.part.toFixed(4)} },`);
    console.log(`    oneUp: { margin: ${up.margin.toFixed(4)}, part: ${up.part.toFixed(4)} },`);
    if (down !== undefined) {
      console.log(
        `  the mirror it is replacing: a game down fitted base ${down.base.toFixed(4)}, ` +
          `part ${down.part.toFixed(4)}, margin ${down.margin.toFixed(4)}`,
      );
      console.log(`  and the symmetric states fitted ${level.base.toFixed(4)} and ${each.base.toFixed(4)} against an imposed zero`);
    }
  }

  console.log();
  console.log("Calibration — the fit against the outcomes it was fitted from");
  console.log("  predicted    deals   actually won");
  const bands = [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1.01];
  for (let band = 0; band < bands.length - 1; band++) {
    const lo = bands[band]!;
    const hi = bands[band + 1]!;
    const inBand = samples.filter((one) => {
      const state = fits.get(states.find((s) => s.games[0] === one.games[0] && s.games[1] === one.games[1])?.label ?? "");
      if (state === undefined) {
        return false;
      }
      const chance = equityAt(state, one.part, one.margin);
      return chance >= lo && chance < hi;
    });
    if (inBand.length === 0) {
      continue;
    }
    const won = inBand.reduce((total, one) => total + one.won, 0) / inBand.length;
    console.log(`  ${`${lo.toFixed(2)}–${hi.toFixed(2)}`.padEnd(13)}${String(inBand.length).padStart(5)}   ${won.toFixed(3)}`);
  }
}

const rubbers = Number(process.argv[2] ?? 1500);
const samples = Number(process.argv[3] ?? 0) || 0;
/**
 * Which bidder plays the rubbers being fitted from.
 *
 * `objective=equity` is the second half of the circularity this file warns about:
 * the shipped table was fitted from rubbers played by the points bidder, so it
 * describes how *that* bidder converts a standing. Refitting from the bidder the
 * table has been handed to, and checking whether the coefficients moved, is the
 * only way to know the fit is a fixed point rather than a description of the
 * thing it replaced.
 */
const objective = process.argv.includes("objective=equity") ? "equity" : "points";
/** `format=game` fits the short match, which is a different game and needs its own numbers. */
const format: MatchFormat = process.argv.includes("format=game") ? "game" : "rubber";
const tuning = { objective } as const;
const cardPlay = (seed: number): Bot =>
  samples > 0
    ? createSamplingBot(createRng(seed), samples, tuning)
    : createHeuristicBot(createRng(seed), tuning);

console.log(
  `Fitting from ${rubbers} ${format === "game" ? "single games" : "rubbers"}, ${objective} bidder, ` +
    `${samples > 0 ? `${samples} samples a card` : "heuristic card play"}`,
);
const handsArg = process.argv.find((arg) => arg.startsWith("hands="));
if (handsArg !== undefined) {
  const rebuilt = rebuildFromLog(handsArg.slice("hands=".length));
  console.log(`Rebuilt ${rebuilt.rubbers} finished rubbers from the log, dropping ${rebuilt.dropped} that did not chain`);
  console.log();
  report(rebuilt.samples, true);
  process.exit(0);
}

const collected: Sample[] = [];
let finished = 0;
for (let index = 0; index < rubbers; index++) {
  const rows = playRubber([cardPlay(index * 2 + 1), cardPlay(index * 2 + 2)], index + 1, format);
  if (rows.length > 0) {
    finished += 1;
    collected.push(...rows);
  }
  if ((index + 1) % 250 === 0) {
    console.log(`  ${index + 1} rubbers, ${collected.length} standings`);
  }
}
console.log(`${finished}/${rubbers} matches finished inside ${MAX_DEALS} deals`);
console.log();
report(collected, false, format === "game" ? GAME_STATES : STATES);
