import { applyAction, createRng, randomSeed, startDeal, viewFor } from "@hb/engine";
import type { DealState, Strain } from "@hb/engine";
import { timeBidSearch } from "../bot/bidTiming.js";
import { createHeuristicBot } from "../bot/heuristicBot.js";
import { botActionFor, loveAll } from "./botTurn.js";

/**
 * How long a bid search takes *on this device*, which is the only place the
 * question can be answered.
 *
 * `bench/bidcost.ts` runs the identical code on a desktop and reports about 7ms a
 * solve. Phones run this kind of JavaScript somewhere between two and four times
 * slower, and which end of that range applies decides the shape of the feature:
 * whether a bid search can happen inside the pause the bot already takes, or has to
 * move to a worker.
 *
 * Deliberately synchronous and deliberately blocking. Bidding by search would be
 * synchronous too — that is the thing being measured, and hiding it behind an
 * animation here would measure the animation.
 */

const SAMPLES = 25;
const TWO: readonly Strain[] = ["H", "NT"];

/** Plays a draw out so the timing happens at a real auction position. */
function atFirstCall(seed: number): DealState {
  const bots = [createHeuristicBot(createRng(seed + 1)), createHeuristicBot(createRng(seed + 2))];
  let state: DealState = startDeal({ seed, starter: 0 });
  while (state.phase === "draw") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat]!, seat, standing: loveAll(), state }));
  }
  return state;
}

/**
 * One line, because it is read off a phone screen and then typed into a message.
 *
 * Both shapes at once: five strains is the naive version of the feature, two is
 * the cheapest useful one. The per-solve figure is what scales, so it is the one
 * to compare against the desktop's 7ms.
 */
export function runBidTiming(): string {
  const seed = randomSeed();
  const state = atFirstCall(seed);
  const seat = state.toAct;
  const view = viewFor(state, seat);
  const remembered = state.discards[seat];

  const five = timeBidSearch({ remembered, rng: createRng(seed + 11), samples: SAMPLES, view });
  const two = timeBidSearch({
    remembered,
    rng: createRng(seed + 13),
    samples: SAMPLES,
    strains: TWO,
    view,
  });

  return (
    `${SAMPLES} samples · five strains ${five.totalMs.toFixed(0)}ms · ` +
    `two strains ${two.totalMs.toFixed(0)}ms · ` +
    `${five.perSolveMs.toFixed(1)}ms a solve (desktop is 7.1)`
  );
}
