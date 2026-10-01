import { describe, expect, it } from "vitest";
import { dealOf, nextIn, seedOf, startMatch, startDeal } from "../src/index.js";
import type { FieldBoard, MatchState, PlayerId } from "../src/index.js";

/**
 * What a logged deal is replayable from.
 *
 * The property is not that `seedOf` returns a number — it is that the number
 * *reproduces the deal on the table*, which is the only reason the hand log keeps
 * one. So every case deals the seed back through `startDeal` and compares.
 *
 * The bug it was written against: `localSession` advanced a `dealSeed` ref with a
 * fresh random seed before every `nextIn` and logged that, which is right for a
 * rubber and wrong everywhere else — a session's deals are its boards and `nextIn`
 * discards the seed. Each format below is therefore advanced with a seed that
 * deals nothing, which is what makes the assertion bite rather than pass on a
 * coincidence.
 */

/** A seed no format under test is dealt from, standing in for the ref's random one. */
const UNUSED = 999_777;

function boardsFor(seeds: readonly number[]): FieldBoard[] {
  return seeds.map((seed, index) => ({
    ids: [`f${seed}-0`, null] as [string | null, string | null],
    seed,
    starter: (index % 2) as PlayerId,
    vulnerable: [false, false] as [boolean, boolean],
  }));
}

/** The seed reproduces the deal exactly — stock, hands to come, and all. */
function replays(match: MatchState): boolean {
  const seed = seedOf(match);
  if (seed === null) {
    return false;
  }
  const deal = dealOf(match);
  return JSON.stringify(startDeal({ seed, starter: deal.starter })) === JSON.stringify(deal);
}

describe("the seed a deal was dealt from", () => {
  it("reproduces the opening deal of a rubber", () => {
    const match = startMatch({ firstBoard: 1, format: "rubber", seed: 4242, starter: 0 });
    expect(seedOf(match)).toBe(4242);
    expect(replays(match)).toBe(true);
  });

  it("follows a rubber on, since a rubber really is dealt from the seed it is handed", () => {
    const match = nextIn(
      startMatch({ firstBoard: 1, format: "rubber", seed: 4242, starter: 0 }),
      8484,
    );
    expect(seedOf(match)).toBe(8484);
    expect(replays(match)).toBe(true);
  });

  it("reads a Doop board's own seed rather than the one it was advanced with", () => {
    const boards = boardsFor([77_001, 77_002]);
    let match = startMatch({
      fieldBoards: boards,
      firstBoard: 1,
      format: "field",
      me: 0,
      seed: UNUSED,
      starter: 0,
    });
    expect(seedOf(match)).toBe(77_001);
    expect(replays(match)).toBe(true);

    match = nextIn(match, UNUSED);
    expect(seedOf(match)).toBe(77_002);
    expect(seedOf(match)).not.toBe(UNUSED);
    expect(replays(match)).toBe(true);
  });

  it("reads a duplicate board's own seed rather than the one it was advanced with", () => {
    let match = startMatch({
      boards: 2,
      firstBoard: 500,
      format: "duplicate",
      schedule: "adjacent",
      seed: UNUSED,
      starter: 0,
    });
    const opening = seedOf(match);
    expect(opening).not.toBe(UNUSED);
    expect(replays(match)).toBe(true);

    match = nextIn(match, UNUSED);
    expect(seedOf(match)).not.toBe(UNUSED);
    expect(replays(match)).toBe(true);
  });

  it("follows a mirror into its second half, where the boards come back", () => {
    let match: MatchState = startMatch({
      firstBoard: 1,
      format: "mirror",
      seed: 1234,
      starter: 0,
    });
    expect(seedOf(match)).toBe(1234);
    expect(replays(match)).toBe(true);

    match = nextIn(match, 5678);
    expect(seedOf(match)).toBe(5678);
    expect(replays(match)).toBe(true);
  });
});
