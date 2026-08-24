import { applyAction, createRng, startDeal, viewFor } from "@hb/engine";
import type { Card, DealState, PlayerId } from "@hb/engine";
import { canSimulate } from "../src/bot/drawSimulation.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { sampleOpponentHand } from "../src/bot/sample.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/**
 * Does a guessed hand have the *shape* a real one has?
 *
 * The high-card-point check was confounded: a pool rich in honours causes more
 * keeps, so keep count tracks pool strength and any honour-weighted draw tracks it
 * too. Yet replaying the draw improved the searched trick estimate where the rank
 * weight did not, so it is doing something the point count cannot see. Shape is the
 * candidate — a hand built by a draw policy has suits it was building, where a
 * weighted random draw has whatever fell out.
 */
const deals = Number(process.argv[2] ?? 300);

function drawn(seed: number): DealState {
  const bots = [createHeuristicBot(createRng(seed + 1)), createHeuristicBot(createRng(seed + 2))];
  let state: DealState = startDeal({ seed, starter: 0 });
  while (state.phase === "draw") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat]!, seat, standing: loveAll(), state }));
  }
  return state;
}

function longest(hand: readonly Card[]): number {
  const counts = new Map<string, number>();
  for (const card of hand) {
    counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
  }
  return Math.max(...counts.values());
}

function voids(hand: readonly Card[]): number {
  return 4 - new Set(hand.map((card) => card.suit)).size;
}

let realLong = 0;
let realVoid = 0;
let guessLong = 0;
let guessVoid = 0;
let n = 0;

for (let seed = 1; seed <= deals; seed++) {
  const state = drawn(seed);
  for (const seat of [0, 1] as PlayerId[]) {
    const them: PlayerId = seat === 0 ? 1 : 0;
    const view = viewFor(state, seat);
    if (!canSimulate([], 13, [])) {
      // guard is checked inside the sampler; this only documents intent
    }
    const rng = createRng(seed * 7919 + seat);
    realLong += longest(state.hands[them]!);
    realVoid += voids(state.hands[them]!);
    for (let i = 0; i < 3; i++) {
      const guess = sampleOpponentHand(view, rng, state.discards[seat]);
      guessLong += longest(guess) / 3;
      guessVoid += voids(guess) / 3;
    }
    n += 1;
  }
}

console.log(`Over ${deals} deals, both seats (${n} hands):`);
console.log(`  longest suit, real hands      ${(realLong / n).toFixed(2)}`);
console.log(`  longest suit, guessed hands   ${(guessLong / n).toFixed(2)}`);
console.log(`  voids, real hands             ${(realVoid / n).toFixed(2)}`);
console.log(`  voids, guessed hands          ${(guessVoid / n).toFixed(2)}`);
