import { applyAction, createRng, legalActionsForView, startDeal, viewFor } from "@hb/engine";
import type { DealState, PlayerId, PlayerView, Strain } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { searchTricks } from "../src/bot/searchTricks.js";

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
