import { applyAction, createRng, legalActionsForView, startDeal, viewFor } from "@hb/engine";
import type { DealState, PlayerId, PlayerView, Strain } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { centredOn, searchTricks } from "../src/bot/searchTricks.js";

/**
 * The second solve, and why it is a second solve rather than an inversion.
 *
 * `searchTricks` has always solved with the opponent on lead, which answers what *this*
 * seat takes declaring. The branch of `estimateFor` that prices a pass, a raise over
 * them or a double is about a contract *they* would declare — a different position,
 * because double-dummy tricks depend on who leads. The cheap version, reversing this
 * seat's distribution, was tried once and priced a position nobody was in.
 *
 * These drive a real deal to the end of its draw rather than constructing a view, so
 * the hands are ones the engine actually produced and the pool the sampler draws from
 * is the real one.
 */

/** A view with thirteen cards each and nothing played — the auction's first decision. */
function dealtView(seed: number, seat: PlayerId): PlayerView {
  let state: DealState = startDeal({ seed, starter: 0 });
  while (state.phase === "draw") {
    const acting = state.toAct;
    const legal = legalActionsForView(viewFor(state, acting));
    state = applyAction(state, acting, legal[0]!);
  }
  return viewFor(state, seat);
}

const STRAINS: readonly Strain[] = ["H", "S"];

function search(view: PlayerView, defending: readonly Strain[], samples = 20) {
  return searchTricks({
    budgetMs: 10_000,
    defending,
    maxSamples: samples,
    rng: createRng(99),
    strains: STRAINS,
    view,
  });
}

describe("searching the position the opponent declares", () => {
  it("produces a distribution only for the strains asked for", () => {
    const result = search(dealtView(4242, 0), ["H"]);

    expect(result.sampled).toBeGreaterThan(0);
    expect(result.theirSpreads.get("H")?.samples).toBe(result.sampled);
    // Priced for this seat declaring, and deliberately not for them.
    expect(result.spreads.get("S")).toBeDefined();
    expect(result.theirSpreads.get("S")).toBeUndefined();
  });

  it("asks for nothing when nothing is named, which is what keeps it cheap", () => {
    expect(search(dealtView(4242, 0), []).theirSpreads.size).toBe(0);
  });

  /**
   * **The assertion the whole change rests on.** If what they take declaring were
   * thirteen minus what this seat takes declaring, the second solve would be waste and
   * `mirrorOdds` would have been right. Across a set of real deals it is not: the two
   * differ, because the lead moves.
   *
   * Asserted over several deals and counted rather than on one, since any single deal
   * can happen to agree — a lay-down contract takes the same tricks from either side.
   * The count is what stops this passing on a sample where they all agreed.
   */
  it("differs from thirteen minus this seat's own distribution", { timeout: 60_000 }, () => {
    let differed = 0;
    let compared = 0;

    for (const seed of [11, 22, 33, 44]) {
      for (const seat of [0, 1] as PlayerId[]) {
        const result = search(dealtView(seed, seat), ["H"], 8);
        const mine = result.spreads.get("H")!;
        const theirs = result.theirSpreads.get("H")!;
        compared += 1;
        if (Math.abs(theirs.mean - (13 - mine.mean)) > 0.001) {
          differed += 1;
        }
      }
    }

    expect(compared).toBe(8);
    expect(differed).toBeGreaterThan(0);
  });

  /**
   * Both distributions come from the *same* guessed hands, which is what makes them
   * comparable at all — a defending estimate priced against luckier opponents than the
   * declaring one would make every pass look better than every bid. The sample count is
   * the observable for that, since the two are filled in the same loop.
   */
  it("prices both positions over the same sampled hands", () => {
    const result = search(dealtView(777, 1), ["H", "S"]);

    for (const strain of STRAINS) {
      expect(result.theirSpreads.get(strain)?.samples).toBe(result.spreads.get(strain)?.samples);
    }
  });
});

/**
 * Moving a measured distribution onto a blended centre.
 *
 * `expectedValue` reads `options.odds ?? outcomeOdds(options.estimate)`, so supplying
 * odds makes the estimate unreachable. Handing it a raw search distribution for a
 * contract the opponent declares therefore discarded the blend with their bid — weight
 * 0.75 on that branch — and measured 30% of rubbers over 40 plays against an even
 * expectation. Keeping the shape and moving the centre is what preserves both, and it
 * is the same mistake, in the same file, that cost +651 a rubber against +467 when the
 * search was first built.
 */
describe("centring a searched distribution on an estimate", () => {
  const spike = (at: number): number[] =>
    Array.from({ length: 14 }, (_, tricks) => (tricks === at ? 1 : 0));

  const meanOf = (odds: readonly number[]): number =>
    odds.reduce((total, chance, tricks) => total + chance * tricks, 0);

  it("moves the mean to where it is asked, whole tricks or fractions of one", () => {
    expect(meanOf(centredOn(spike(9), 7))).toBeCloseTo(7, 6);
    expect(meanOf(centredOn(spike(5), 8.5))).toBeCloseTo(8.5, 6);
  });

  /** The width is the whole point of searching, so it must survive the move. */
  it("keeps the shape rather than collapsing it onto the estimate", () => {
    const spread = Array.from({ length: 14 }, (_, t) => (t >= 7 && t <= 11 ? 0.2 : 0));
    const moved = centredOn(spread, 6);

    expect(moved.filter((chance) => chance > 0.0001).length).toBeGreaterThanOrEqual(5);
    expect(meanOf(moved)).toBeCloseTo(6, 6);
  });

  it("still sums to one, including when mass is pushed off an end", () => {
    for (const target of [0, 1, 6.4, 12, 13]) {
      const moved = centredOn(spike(9), target);
      expect(moved.reduce((total, chance) => total + chance, 0)).toBeCloseTo(1, 6);
      expect(moved.every((chance) => chance >= 0)).toBe(true);
    }
  });

  /**
   * A contract cannot take fourteen tricks, so mass piling at the end is correct rather
   * than a rounding fault — and it means the result's mean falls short of an impossible
   * target, which is the honest answer.
   */
  it("piles mass at the end rather than losing it past thirteen", () => {
    const moved = centredOn(spike(12), 20);

    expect(moved[13]).toBeCloseTo(1, 6);
    expect(meanOf(moved)).toBeCloseTo(13, 6);
  });

  it("leaves a distribution already centred exactly where it is", () => {
    expect(centredOn(spike(8), 8)).toEqual(spike(8));
  });
});
