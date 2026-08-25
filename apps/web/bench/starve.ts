import { applyAction, createRng, startDeal, viewFor } from "@hb/engine";
import type { DealState, Strain } from "@hb/engine";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { searchTricks } from "../src/bot/searchTricks.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

// How often does a deadline-bounded search come back with almost nothing?
// The mean says 9.4 samples; the mean is not the question. `oddsFor` trusts any
// spread with at least one sample, and a one-sample spread is a spike.
const deals = Number(process.argv[2] ?? 60);
const budgetMs = Number(process.argv[3] ?? 250);
// What the real bidder considers on a live auction, not all five.
const strains: Strain[] = ["H", "S", "NT"];

function atFirstCall(seed: number): DealState {
  const bots = [createHeuristicBot(createRng(seed + 1)), createHeuristicBot(createRng(seed + 2))];
  let state: DealState = startDeal({ seed, starter: 0 });
  while (state.phase === "draw") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat]!, seat, standing: loveAll(), state }));
  }
  return state;
}

const counts: number[] = [];
for (let seed = 1; seed <= deals; seed++) {
  const state = atFirstCall(seed);
  const seat = state.toAct;
  const result = searchTricks({
    budgetMs,
    maxSamples: 25,
    remembered: state.discards[seat],
    rng: createRng(seed * 7919),
    strains,
    view: viewFor(state, seat),
  });
  counts.push(result.sampled);
}

counts.sort((a, b) => a - b);
const at = (p: number): number => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))]!;
const under = (n: number): string =>
  `${((100 * counts.filter((one) => one < n).length) / counts.length).toFixed(0)}%`;

console.log(`${deals} deals, ${budgetMs}ms, ${strains.length} strains`);
console.log(`  min ${counts[0]}   p10 ${at(0.1)}   median ${at(0.5)}   p90 ${at(0.9)}   max ${counts.at(-1)}`);
console.log(`  fewer than 3 samples: ${under(3)}`);
console.log(`  fewer than 5 samples: ${under(5)}`);
