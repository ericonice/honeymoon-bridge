import { describe, expect, it } from "vitest";
import { applyFieldAction, fieldVulnerableFor, startField } from "../src/field.js";
import type { FieldBoard } from "../src/field.js";
import { legalActionsForView, viewFor } from "../src/index.js";
import type { PlayerId } from "../src/types.js";

/**
 * What a board prescribes, and the property the corpus rests on: **both boards of a
 * stock put the same terms on the same stream.**
 *
 * A stock makes two boards dealt from either end, and every result recorded on one
 * of them has to have been made on the terms anybody playing it afterwards will be
 * given. The generator wrote one pair against both boards, which gave the second
 * one's two seats each other's terms — and half the cycle hides it, because half the
 * time both streams are on the same terms anyway.
 */

const SEEDS = [1, 2, 3, 4, 17, 20260929, 20260930, 4294967291];

/** Which seat draws first on a board, which is the seat holding the first stream. */
function firstDrawer(starter: PlayerId): PlayerId {
  return starter;
}

describe("the terms a board is played on", () => {
  it("gives the first-draw stream the same answer on both boards of a stock", () => {
    for (const seed of SEEDS) {
      const asDealt = fieldVulnerableFor(seed, 0);
      const reversed = fieldVulnerableFor(seed, 1);

      expect(reversed[firstDrawer(1)]).toBe(asDealt[firstDrawer(0)]);
    }
  });

  it("gives the second-draw stream the same answer on both boards of a stock", () => {
    for (const seed of SEEDS) {
      const asDealt = fieldVulnerableFor(seed, 0);
      const reversed = fieldVulnerableFor(seed, 1);

      expect(reversed[1 - firstDrawer(1)]).toBe(asDealt[1 - firstDrawer(0)]);
    }
  });

  /**
   * The anti-vacuity half. Both assertions above hold trivially against a rule that
   * returns the same pair for either starter *whenever the two streams agree* — which
   * is half the cycle — so the swap has to be caught where they differ.
   */
  it("turns the pair round where the two streams are on different terms", () => {
    const differing = SEEDS.filter((seed) => {
      const [first, second] = fieldVulnerableFor(seed, 0);
      return first !== second;
    });
    expect(differing.length).toBeGreaterThan(0);

    for (const seed of differing) {
      expect(fieldVulnerableFor(seed, 1)).toEqual([
        fieldVulnerableFor(seed, 0)[1],
        fieldVulnerableFor(seed, 0)[0],
      ]);
    }
  });

  it("depends on the seed rather than on when a board was made", () => {
    for (const seed of SEEDS) {
      expect(fieldVulnerableFor(seed, 0)).toEqual(fieldVulnerableFor(seed, 0));
      expect(fieldVulnerableFor(seed + 4, 0)).toEqual(fieldVulnerableFor(seed, 0));
    }
  });

  /**
   * The property read through the engine rather than through the arithmetic: play a
   * stock from both ends and the seat holding a given stream is vulnerable in both,
   * or in neither. Driven rather than asserted about the pair, because what the
   * corpus actually compares is what a *deal* was scored at.
   */
  it("puts the same seat's stream on the same terms when the stock is dealt from either end", () => {
    const seed = 17;
    for (const starter of [0, 1] as const) {
      const board: FieldBoard = {
        ids: [`f${seed}-${starter}`, null],
        seed,
        starter,
        vulnerable: fieldVulnerableFor(seed, starter),
      };
      let state = startField({ boards: [board] });
      // The seat that draws first is the one holding the first stream, whichever
      // board this is — that is what `starter` means.
      expect(state.deal.toAct).toBe(starter);
      expect(board.vulnerable[starter]).toBe(fieldVulnerableFor(seed, 0)[0]);

      // And the terms survive being played on: one action is enough to know the
      // board was built from the pair above rather than from a default.
      const actor = state.deal.toAct;
      state = applyFieldAction(state, actor, legalActionsForView(viewFor(state.deal, actor))[0]!);
      expect(state.boards[0]!.vulnerable).toEqual(board.vulnerable);
    }
  });
});
