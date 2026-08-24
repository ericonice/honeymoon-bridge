import { applyAction, createRng, startDeal, viewFor } from "@hb/engine";
import type { DealState, Strain } from "@hb/engine";
import { timeBidSearch } from "../src/bot/bidTiming.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/**
 * What bidding by search would cost, on this machine.
 *
 * The baseline for the same measurement taken on a phone — see the "Time a bid
 * search" row in the testing panel. Two numbers from the same code, so the ratio
 * between them is the thing to read rather than either on its own: phones run this
 * kind of JavaScript somewhere between two and four times slower, and which end of
 * that range decides whether the feature needs a worker.
 *
 *   npm run bench:bidcost --workspace @hb/web -- [samples]
 *
 * Measured at each seat's first turn to call, which is the worst case: thirteen
 * cards each, nothing played, so every solve is a full thirteen-trick search.
 */

const samples = Number(process.argv[2] ?? 25);
const deals = Number(process.argv[3] ?? 20);

/** Plays the draw out so the timing happens at a real auction position. */
function atFirstCall(seed: number): DealState {
  const bots = [createHeuristicBot(createRng(seed + 1)), createHeuristicBot(createRng(seed + 2))];
  let state: DealState = startDeal({ seed, starter: 0 });
  while (state.phase === "draw") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat]!, seat, standing: loveAll(), state }));
  }
  return state;
}

const HALF: readonly Strain[] = ["H", "NT"];

function quantile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!;
}

/**
 * The distribution, not the mean, and that correction is the point of this pass.
 *
 * This bench used to print an average over twenty deals, which read as a settled
 * cost of about 900ms and hid the only number that decides anything. Tapping the
 * phone row a dozen times found half the runs under 500ms and the longest at four
 * seconds — a twelvefold spread on one device. **A mean is the wrong summary for a
 * latency budget**; what freezes a screen is the worst case, and this project has
 * now made that class of mistake often enough to be embarrassing about it.
 *
 * The cause is shape rather than hardware. A double-dummy search collapses fast on
 * hands with long suits and clear structure — many equivalent moves, plenty of
 * transposition hits — and explodes on flat hands with scattered honours, where
 * there is little to collapse and the branching stays wide.
 */
function report(label: string, values: readonly number[]): void {
  const sorted = [...values].sort((one, two) => one - two);
  const mean = values.reduce((total, one) => total + one, 0) / Math.max(1, values.length);
  console.log(
    `  ${label.padEnd(11)}${mean.toFixed(0).padStart(7)}${quantile(sorted, 0.5).toFixed(0).padStart(9)}` +
      `${quantile(sorted, 0.9).toFixed(0).padStart(8)}${(sorted[sorted.length - 1] ?? 0).toFixed(0).padStart(8)}` +
      `${(sorted[0] ?? 0).toFixed(0).padStart(8)}`,
  );
}

console.log(`Timing a bid search: ${samples} samples, ${deals} deals, at the first call`);
console.log();
console.log("  strains       mean   median     p90     max     min   (ms per pass)");

for (const [label, strains] of [
  ["all five", undefined],
  ["two", HALF],
] as const) {
  const passes: number[] = [];
  for (let seed = 1; seed <= deals; seed++) {
    const state = atFirstCall(seed);
    const seat = state.toAct;
    const timing = timeBidSearch({
      remembered: state.discards[seat],
      rng: createRng(seed * 7919),
      samples,
      view: viewFor(state, seat),
      ...(strains === undefined ? {} : { strains }),
    });
    passes.push(timing.totalMs);
  }
  report(label, passes);
}

console.log();
console.log("  Read the max, not the mean: the max is what freezes a screen.");
console.log("  Cost is driven by hand shape — flat hands with scattered honours are");
console.log("  the expensive ones, and they are also where the heuristic is weakest.");
