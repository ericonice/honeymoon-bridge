import { applyAction, createRng, dealScoreFor, startDeal } from "@hb/engine";
import type { DealState, Pair, PlayerId, Rng } from "@hb/engine";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { createSamplingBot } from "../src/bot/samplingBot.js";
import type { Bot } from "../src/bot/types.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";
import { createProgress } from "./progress.js";

/**
 * Two bots across the same table, in points rather than in tricks.
 *
 * Par says how far from perfect a bot is; this says which of two bots wins, and
 * by how much, which is the question a change to the bot is finally answering.
 *
 * Both of these bots draw and bid identically — the sampling bot replaces card
 * play only — so for a given seed the hands, the draw and the auction come out
 * the same whichever bot sits where. The contract is therefore held fixed and
 * the only thing varying is the play, which is what makes so few deals enough.
 * Every seed is played twice with the seats exchanged, so being declarer, or
 * leading, cannot favor either side.
 *
 *   npx vite-node bench/head.ts [deals] [samples]
 */

type BotFactory = (rng: Rng) => Bot;

function playDeal(seed: number, starter: PlayerId, bots: Pair<Bot>): DealState {
  let state = startDeal({ seed, starter });
  while (state.phase !== "complete") {
    state = applyAction(state, state.toAct, botActionFor({ bot: bots[state.toAct], seat: state.toAct, standing: loveAll(), state }));
  }
  return state;
}

/** Everything the deal is worth to each side, above and below the line together. */
function pointsFor(state: DealState): Pair<number> {
  const score = dealScoreFor(state, [false, false]);
  if (score === null) {
    return [0, 0];
  }
  return [score.aboveLine[0] + score.belowLine[0], score.aboveLine[1] + score.belowLine[1]];
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

function run(deals: number, samples: number): void {
  const challenger: BotFactory = (rng) => createSamplingBot(rng, samples);
  const incumbent: BotFactory = (rng) => createHeuristicBot(rng);

  const margins: number[] = [];
  let contested = 0;
  const started = performance.now();
  const playing = createProgress(deals, "playing");

  for (let seed = 1; seed <= deals; seed++) {
    const starter = (seed % 2) as PlayerId;

    for (const challengerSeat of [0, 1] as const) {
      const bots: Pair<Bot> = [
        challengerSeat === 0 ? challenger(createRng(seed)) : incumbent(createRng(seed)),
        challengerSeat === 1 ? challenger(createRng(seed)) : incumbent(createRng(seed)),
      ];
      const state = playDeal(seed, starter, bots);
      if (state.passedOut) {
        continue;
      }
      const points = pointsFor(state);
      margins.push(points[challengerSeat] - points[challengerSeat === 0 ? 1 : 0]);
      contested += 1;
    }
    playing(seed, `${mean(margins) >= 0 ? "+" : ""}${mean(margins).toFixed(0)} points per deal`);
  }

  const elapsed = (performance.now() - started) / 1000;
  const margin = mean(margins);
  const error = standardError(margins);

  console.log(`sampling (${samples} samples) against heuristic`);
  console.log(`${contested} deals, both seats each, in ${elapsed.toFixed(0)}s\n`);
  console.log(`  sampling's margin   ${margin >= 0 ? "+" : ""}${margin.toFixed(1)} points per deal`);
  console.log(`  standard error      ${error.toFixed(1)}`);
  console.log(`  that is             ${(Math.abs(margin) / Math.max(0.01, error)).toFixed(1)} standard errors`);
  console.log(`  deals won / lost    ${margins.filter((m) => m > 0).length} / ${margins.filter((m) => m < 0).length}`);
}

run(Number(process.argv[2] ?? 100), Number(process.argv[3] ?? 25));
