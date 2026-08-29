import {
  actOn,
  canReturn,
  dealOf,
  halfOf,
  legalActions,
  nextIn,
  returnMatch,
  startMatch,
  summarizeMatch,
} from "@hb/engine";
import type { MatchState } from "@hb/engine";
import { describe, expect, test } from "vitest";
import { boardKeyOf } from "../src/game/boardKey.js";

/**
 * A driver that opens the cheapest contract and passes to it, and the keys of every
 * deal it played, oldest first.
 *
 * The same driver `packages/engine/test/returnMatch.test.ts` arrived at, for the same
 * two reasons: taking the first legal action passes every deal out, so no side ever
 * reaches a hundred and a mirror never turns over, and taking the last climbs to seven
 * no-trump, whose penalties score above the line so no game is ever won either. Both
 * would make everything below hold for the wrong reason.
 */
function playDeal(match: MatchState): MatchState {
  let state = match;
  while (dealOf(state).phase !== "complete") {
    const seat = dealOf(state).toAct;
    const legal = legalActions(dealOf(state), seat);
    const opening = legal.find(
      (one) => one.type === "call" && one.call.type === "bid" && one.call.bid.level === 1,
    );
    const bidden = dealOf(state).auction.some((entry) => entry.call.type === "bid");
    const action =
      dealOf(state).phase === "auction" && !bidden ? (opening ?? legal[0]!) : legal[0]!;
    state = actOn(state, seat, action);
  }
  return state;
}

function play(match: MatchState, deals: number): { keys: (number | null)[]; state: MatchState } {
  let state = match;
  const keys: (number | null)[] = [];
  for (let deal = 0; deal < deals; deal += 1) {
    keys.push(boardKeyOf(state));
    state = playDeal(state);
    if (summarizeMatch(state).complete) {
      return { keys, state };
    }
    state = nextIn(state, 2000 + deal);
  }
  return { keys, state };
}

/** Every deal of a two-game match, tagged with which half it was played in. */
function mirrorKeys(seed: number): { one: (number | null)[]; two: (number | null)[] } {
  let state: MatchState = startMatch({ firstBoard: 0, format: "mirror", seed, starter: 0 });
  const one: (number | null)[] = [];
  const two: (number | null)[] = [];
  for (let deal = 0; deal < 200; deal += 1) {
    (state.kind === "mirror" && halfOf(state) === 2 ? two : one).push(boardKeyOf(state));
    state = playDeal(state);
    if (summarizeMatch(state).complete) {
      break;
    }
    state = nextIn(state, 3000 + deal);
  }
  return { one, two };
}

const START = { firstBoard: 0, format: "rubber", seed: 4242, starter: 0 } as const;

describe("what identifies the board the computer is playing", () => {
  /**
   * The property the whole memory rests on: a board's second run keys the same as its
   * first, so the record of the first run is neither missed nor overwritten.
   *
   * Asserted per format rather than once, because the three places a board comes round
   * reach it by three different routes — a session's schedule, a mirror's second half,
   * and a rubber replayed by hand — and only the first of them was ever wired up.
   */
  test("a mirror's second half repeats the first half's boards in order", () => {
    const { one, two } = mirrorKeys(4242);

    expect(one.length, "the first half never finished").toBeGreaterThan(1);
    expect(two.length, "the pair never turned over, so this asserted nothing").toBeGreaterThan(0);
    // Before the comparison, for the reason the return match's own test gives.
    expect(one).not.toContain(null);
    expect(two).not.toContain(null);
    // The second half runs longer than the first about two fifths of the time, so it is
    // the shared prefix that has to match rather than the whole of either.
    expect(two.slice(0, one.length)).toEqual(one.slice(0, two.length));
  });

  test("a return match repeats the rubber it is replaying", () => {
    const first = play(startMatch(START), 400);
    expect(summarizeMatch(first.state).complete).toBe(true);
    expect(canReturn(first.state)).toBe(true);

    const back = play(returnMatch(first.state), 400);
    expect(back.keys.length).toBeGreaterThan(0);
    // Before the comparison, because two runs of nulls compare equal — which is
    // exactly what the version this test was written against produced, and it passed.
    expect(back.keys).not.toContain(null);
    const shared = Math.min(first.keys.length, back.keys.length);
    expect(back.keys.slice(0, shared)).toEqual(first.keys.slice(0, shared));
  });

  test("a duplicate session plays every board exactly twice under one key", () => {
    const session = startMatch({
      boards: 2,
      firstBoard: 500,
      format: "duplicate",
      seed: 3,
      starter: 0,
    });
    const { keys } = play(session, 20);

    expect(keys).toHaveLength(4);
    for (const key of new Set(keys)) {
      expect(keys.filter((one) => one === key)).toHaveLength(2);
    }
    expect(new Set(keys).size).toBe(2);
  });

  /**
   * The other half of it, and the reason a plain rubber costs nothing: every deal is
   * dealt from its own seed, so nothing is ever recognised and the memory stays empty.
   * A key that repeated here would have the computer claiming to know a board it has
   * never seen.
   */
  test("a plain rubber never deals the same board twice", () => {
    const { keys } = play(startMatch(START), 400);
    expect(keys.length).toBeGreaterThan(2);
    expect(keys).not.toContain(null);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
