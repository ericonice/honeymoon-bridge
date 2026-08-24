import { buildDeck, createRng, shuffle } from "@hb/engine";
import type { DrawChoice } from "@hb/engine";
import { highCardPoints } from "../src/bot/evaluate.js";
import { simulateDraw } from "../src/bot/drawSimulation.js";

/**
 * All-keeps against all-rejects, on shuffled pools.
 *
 * A synthetic test using the first 26 cards of an ordered deck — two whole suits —
 * found the two indistinguishable, which is either a pathological fixture or a real
 * flaw in how a rejected turn is modelled.
 */
const rounds = Number(process.argv[2] ?? 200);
const all = (choice: DrawChoice): DrawChoice[] => Array.from({ length: 13 }, () => choice);

let kept = 0;
let unseen = 0;
for (let seed = 1; seed <= rounds; seed++) {
  const pool = shuffle(buildDeck(), createRng(seed)).slice(0, 26);
  kept += highCardPoints(simulateDraw({ pool, rng: createRng(seed * 31), turns: all("kept-first") }));
  unseen += highCardPoints(simulateDraw({ pool, rng: createRng(seed * 31), turns: all("took-second") }));
}
const poolPoints = 40 / 2;
console.log(`Over ${rounds} shuffled pools of 26 (about ${poolPoints} points each):`);
console.log(`  all thirteen turns kept        ${(kept / rounds).toFixed(2)}`);
console.log(`  all thirteen taken unseen      ${(unseen / rounds).toFixed(2)}`);
console.log(`  gap                            ${((kept - unseen) / rounds).toFixed(2)}`);
