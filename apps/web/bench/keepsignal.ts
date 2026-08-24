import { applyAction, createRng, startDeal, viewFor } from "@hb/engine";
import type { DealState, PlayerId } from "@hb/engine";
import { highCardPoints } from "../src/bot/evaluate.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { sampleOpponentHand } from "../src/bot/sample.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/**
 * Does how often a seat kept card 1 say how good its hand is?
 *
 * `drawTurns` is public — every seat sees whether the other kept the card it was
 * shown or took the unseen one — and the sampler ignores it completely. It should
 * not: a hand built from turns where the player *chose* the card is a selected
 * hand, and one built from cards taken sight-unseen is closer to a random draw.
 *
 * `KEEP_STRENGTH` corrects for selection with a single global constant, so it
 * treats a player who kept eleven times and one who kept twice identically. If the
 * count carries signal, that constant should be a function of it.
 */
const deals = Number(process.argv[2] ?? 400);

function played(seed: number): DealState {
  const bots = [createHeuristicBot(createRng(seed + 1)), createHeuristicBot(createRng(seed + 2))];
  let state: DealState = startDeal({ seed, starter: 0 });
  while (state.phase === "draw") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat]!, seat, standing: loveAll(), state }));
  }
  return state;
}

const byKeeps = new Map<number, { guessed: number; hcp: number; n: number }>();
const keeps: number[] = [];
const points: number[] = [];

for (let seed = 1; seed <= deals; seed++) {
  const state = played(seed);
  for (const seat of [0, 1] as PlayerId[]) {
    const kept = state.drawTurns.filter((turn) => turn.by === seat && turn.choice === "kept-first").length;
    const hcp = highCardPoints(state.hands[seat]!);
    keeps.push(kept);
    points.push(hcp);
    // What the sampler makes of the same deal, from the other seat's view. This is
    // the test the mechanism exists to pass: not the average, which a constant can
    // also hit, but the *spread* — a hand selected by seven keeps is nine points
    // stronger than one selected by none, and a single fitted number cannot say so.
    const other = seat === 0 ? 1 : 0;
    const view = viewFor(state, other);
    const rng = createRng(seed * 7919 + seat);
    let guessed = 0;
    for (let i = 0; i < 4; i++) {
      guessed += highCardPoints(sampleOpponentHand(view, rng, state.discards[other]));
    }
    const bucket = byKeeps.get(kept) ?? { guessed: 0, hcp: 0, n: 0 };
    byKeeps.set(kept, { guessed: bucket.guessed + guessed / 4, hcp: bucket.hcp + hcp, n: bucket.n + 1 });
  }
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const mk = mean(keeps);
const mp = mean(points);
let sxy = 0;
let sxx = 0;
let syy = 0;
for (let i = 0; i < keeps.length; i++) {
  sxy += (keeps[i]! - mk) * (points[i]! - mp);
  sxx += (keeps[i]! - mk) ** 2;
  syy += (points[i]! - mp) ** 2;
}

console.log(`Over ${deals} deals, both seats — how often a seat kept card 1, against its points:`);
console.log();
console.log("  kept   hands   actual points   sampler guesses");
for (const kept of [...byKeeps.keys()].sort((a, b) => a - b)) {
  const bucket = byKeeps.get(kept)!;
  if (bucket.n < 5) {
    continue;
  }
  console.log(
    `  ${String(kept).padStart(4)}${String(bucket.n).padStart(8)}   ${(bucket.hcp / bucket.n).toFixed(2).padStart(13)}   ${(bucket.guessed / bucket.n).toFixed(2).padStart(15)}`,
  );
}
console.log();
console.log(`  mean keeps ${mk.toFixed(2)} of 13, mean points ${mp.toFixed(2)}`);
console.log(`  correlation ${(sxy / Math.sqrt(sxx * syy)).toFixed(3)}`);
console.log(`  slope       ${(sxy / sxx).toFixed(2)} points per extra keep`);
