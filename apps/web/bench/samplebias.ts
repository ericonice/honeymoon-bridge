import { applyAction, createRng, startDeal, viewFor } from "@hb/engine";
import type { DealState } from "@hb/engine";
import { highCardPoints } from "../src/bot/evaluate.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { sampleOpponentHand } from "../src/bot/sample.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/**
 * Are the cards this seat cannot see exchangeable? They are not, and that is why
 * a searched trick estimate came out biased by more than a trick.
 *
 * `sampleOpponentHand` draws thirteen from everything unaccounted for. In ordinary
 * bridge that is sound: every card is in somebody's hand. Here twenty-six cards
 * are dead — the opponent's discards and the undrawn stock — so the pool holds
 * thirteen cards they *kept* and thirteen they *threw away*, and they were choosing.
 */
const deals = Number(process.argv[2] ?? 300);

function atFirstCall(seed: number): DealState {
  const bots = [createHeuristicBot(createRng(seed + 1)), createHeuristicBot(createRng(seed + 2))];
  let state: DealState = startDeal({ seed, starter: 0 });
  while (state.phase === "draw") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat]!, seat, standing: loveAll(), state }));
  }
  return state;
}

let real = 0;
let sampledPoints = 0;
let theirDiscards = 0;
for (let seed = 1; seed <= deals; seed++) {
  const state = atFirstCall(seed);
  const seat = state.toAct;
  const them = seat === 0 ? 1 : 0;
  const view = viewFor(state, seat);
  real += highCardPoints(state.hands[them]!);
  theirDiscards += highCardPoints(state.discards[them]!);
  const rng = createRng(seed * 104729);
  let sample = 0;
  for (let i = 0; i < 5; i++) {
    sample += highCardPoints(sampleOpponentHand(view, rng, state.discards[seat]));
  }
  sampledPoints += sample / 5;
}

console.log(`Over ${deals} deals, high-card points in the hand this seat cannot see:`);
console.log(`  what the opponent actually holds   ${(real / deals).toFixed(2)}`);
console.log(`  what the sampler guesses           ${(sampledPoints / deals).toFixed(2)}`);
console.log(`  what the opponent threw away       ${(theirDiscards / deals).toFixed(2)}`);
console.log();
console.log("  The gap is the draw phase: they kept their best thirteen of twenty-six.");
console.log("  A sampler drawing uniformly hands them an average hand, so it expects to");
console.log("  take more tricks than it really will.");
