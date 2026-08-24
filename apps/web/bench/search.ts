import { applyAction, createRng, opponentOf, startDeal, viewFor } from "@hb/engine";
import type { DealState, Pair, Card, PlayerId, Strain } from "@hb/engine";
import { estimatedTricks } from "../src/bot/evaluate.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { searchTricks } from "../src/bot/searchTricks.js";
import { solve } from "../src/bot/solver.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/**
 * Is a searched trick estimate better than a counted one, and by how much.
 *
 * The whole case for v4 rests on this single comparison, and it is worth making
 * before building any bidding on top. Both estimators answer the same question —
 * how many tricks does this hand take declaring this strain — and the truth is
 * computable, because once the deal is over both hands are known and the solver
 * gives par exactly.
 *
 *   npm run bench:search --workspace @hb/web -- 200 [budgetMs] [maxSamples]
 *
 * Reported as error against par: the bias, the average absolute miss, and the
 * r-squared. **The absolute miss is the one to read.** A bias near zero only says
 * the estimator is centred, which `evaluate.ts` already achieves by calibration —
 * being right on average while wrong on every hand is exactly the failure the
 * bidder has, and it is invisible in a bias column.
 */

const deals = Number(process.argv[2] ?? 200);
const budgetMs = Number(process.argv[3] ?? 300);
const maxSamples = Number(process.argv[4] ?? 25);

/** The strains a hand would actually consider, rather than all five. */
const CONSIDERED: readonly Strain[] = ["C", "D", "H", "S", "NT"];

function atFirstCall(seed: number): DealState {
  const bots = [createHeuristicBot(createRng(seed + 1)), createHeuristicBot(createRng(seed + 2))];
  let state: DealState = startDeal({ seed, starter: 0 });
  while (state.phase === "draw") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat]!, seat, standing: loveAll(), state }));
  }
  return state;
}

interface Errors {
  readonly absolute: number[];
  readonly signed: number[];
  readonly par: number[];
}

function empty(): Errors {
  return { absolute: [], par: [], signed: [] };
}

function record(into: Errors, estimate: number, par: number): void {
  into.signed.push(estimate - par);
  into.absolute.push(Math.abs(estimate - par));
  into.par.push(par);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, one) => total + one, 0) / values.length;
}

/** How much of par's variance the estimate explains — the same figure `calibrate.ts` reports. */
function rSquared(errors: Errors): number {
  const parMean = mean(errors.par);
  const residual = errors.signed.reduce((total, one) => total + one * one, 0);
  const spread = errors.par.reduce((total, one) => total + (one - parMean) ** 2, 0);
  return spread === 0 ? 0 : 1 - residual / spread;
}

function report(label: string, errors: Errors): void {
  console.log(
    `  ${label.padEnd(22)}${(mean(errors.signed) >= 0 ? "+" : "")}${mean(errors.signed).toFixed(2).padStart(6)}` +
      `${mean(errors.absolute).toFixed(2).padStart(11)}${rSquared(errors).toFixed(3).padStart(11)}` +
      `${String(errors.signed.length).padStart(9)}`,
  );
}

const counted = empty();
const searched = empty();
let sampled = 0;
let ranOut = 0;
let elapsed = 0;
let within = 0;
let widths = 0;

console.log(
  `Counted against searched, ${deals} deals, ${budgetMs}ms budget, up to ${maxSamples} samples`,
);

for (let seed = 1; seed <= deals; seed++) {
  const state = atFirstCall(seed);
  const seat = state.toAct;
  const view = viewFor(state, seat);
  const hands = state.hands as Pair<readonly Card[]>;
  const them: PlayerId = opponentOf(seat);

  const result = searchTricks({
    budgetMs,
    maxSamples,
    remembered: state.discards[seat],
    rng: createRng(seed * 7919),
    strains: CONSIDERED,
    view,
  });
  sampled += result.sampled;
  ranOut += result.ranOut ? 1 : 0;
  elapsed += result.elapsedMs;

  for (const strain of CONSIDERED) {
    // How wide the search thinks the answer is, against how wrong it turns out to
    // be. The first is uncertainty about which cards they hold; the second adds
    // uncertainty about how the cards get played, which no sample contains.
    const spread = result.spreads.get(strain)!;
    const variance =
      spread.counts.reduce((total, count, tricks) => total + count * (tricks - spread.mean) ** 2, 0) /
      Math.max(1, spread.samples);
    within += Math.sqrt(variance);
    widths += 1;
  }

  for (const strain of CONSIDERED) {
    // The truth: this seat declaring that strain, both hands known.
    const par = solve({ hands, leader: them, strain, trick: [] }).tricks[seat];
    record(counted, estimatedTricks(view.hand, strain), par);
    record(searched, result.spreads.get(strain)!.mean, par);
  }

  if (seed % 50 === 0) {
    console.log(`  ${seed} deals, ${(sampled / seed).toFixed(1)} samples a deal`);
  }
}

console.log();
console.log("  estimator              bias   mean |err|   r-squared    cases");
report("counted (evaluate.ts)", counted);
report("searched", searched);
console.log();
console.log(`  samples per deal       ${(sampled / deals).toFixed(1)}`);
console.log(`  hit the deadline       ${ranOut}/${deals}`);
console.log(`  time per deal          ${(elapsed / deals).toFixed(0)}ms`);
console.log(`  search's own spread     ${(within / Math.max(1, widths)).toFixed(2)} tricks (TRICK_SPREAD is 1.3)`);
console.log();
console.log("  Read the mean absolute error. A bias near zero says only that the");
console.log("  estimator is centred, which calibration already buys — being right on");
console.log("  average and wrong on every hand is the failure this is meant to fix.");
