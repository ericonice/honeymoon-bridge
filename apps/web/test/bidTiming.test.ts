import { applyAction, createRng, startDeal, viewFor } from "@hb/engine";
import type { DealState, Strain } from "@hb/engine";
import { describe, expect, test } from "vitest";
import { timeBidSearch } from "../src/bot/bidTiming.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/** A real auction position: the draw played out, nothing led yet. */
function atFirstCall(seed: number): DealState {
  const bots = [createHeuristicBot(createRng(seed + 1)), createHeuristicBot(createRng(seed + 2))];
  let state: DealState = startDeal({ seed, starter: 0 });
  while (state.phase === "draw") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat]!, seat, standing: loveAll(), state }));
  }
  return state;
}

function time(samples: number, strains?: readonly Strain[]) {
  const state = atFirstCall(4);
  const seat = state.toAct;
  return timeBidSearch({
    remembered: state.discards[seat],
    rng: createRng(99),
    samples,
    view: viewFor(state, seat),
    ...(strains === undefined ? {} : { strains }),
  });
}

describe("timing a bid search", () => {
  /**
   * The failure mode of a timing harness is measuring nothing at all and
   * reporting how fast it was. So the assertion is on the *work*: a solved deal
   * gives a trick count between nought and thirteen, and a loop that never
   * reached the solver could not produce one.
   */
  test("reports trick counts, so the timing is of real solves", () => {
    const timing = time(2, ["NT"]);
    expect(timing.solves).toBe(2);
    const tricks = timing.tricks["NT"];
    expect(tricks).toBeGreaterThanOrEqual(0);
    expect(tricks).toBeLessThanOrEqual(13);
  });

  test("one solve answers a strain, so the count is samples times strains", () => {
    expect(time(3, ["H", "NT"]).solves).toBe(6);
  });

  /** The whole point of the measurement: fewer strains is proportionally cheaper. */
  test("restricting the strains does less work", () => {
    expect(time(2, ["NT"]).solves).toBeLessThan(time(2, ["C", "D", "H", "S", "NT"]).solves);
  });

  test("sampling is a small part of the cost, not the cost", () => {
    const timing = time(3, ["NT"]);
    expect(timing.samplingMs).toBeLessThan(timing.totalMs);
  });

  test("asking for nothing costs nothing and does not divide by zero", () => {
    const timing = time(0, ["NT"]);
    expect(timing.solves).toBe(0);
    expect(timing.perSolveMs).toBe(0);
  });
});
