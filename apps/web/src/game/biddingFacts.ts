import { scoreDeal, trickTarget } from "@hb/engine";
import type { Card, Level, Pair, Strain } from "@hb/engine";

/**
 * Every number the bidding tutorial prints that could in principle change,
 * asked of the engine rather than retyped — see `scoringFacts.ts`, which this
 * follows exactly and for the same reason: a hand-typed number is a second
 * account of the rules with no way to stay honest as the first one changes.
 */

const LEVELS: readonly Level[] = [1, 2, 3, 4, 5, 6, 7];
const NO_HANDS: Pair<readonly Card[]> = [[], []];
/** A placeholder contract for `trickTarget`, which reads only `level` and `declarer`. */
const PLACEHOLDER = { declarer: 0 as const, doubling: "none" as const, strain: "NT" as const };

export interface TrickTargetRow {
  readonly declarer: number;
  readonly defender: number;
  readonly level: Level;
}

/**
 * What each side needs, by level — declarer's book-plus-level against the
 * defender's complement, asked of `trickTarget` rather than restated as
 * arithmetic somebody has to re-derive by hand.
 */
export function trickTargets(): readonly TrickTargetRow[] {
  return LEVELS.map((level) => ({
    declarer: trickTarget({ ...PLACEHOLDER, level }, 0),
    defender: trickTarget({ ...PLACEHOLDER, level }, 1),
    level,
  }));
}

export interface DoubledOutcome {
  /** Declarer's net at one, two and three tricks short. */
  readonly down: readonly [number, number, number];
  /** Declarer's net making the contract with no overtricks. */
  readonly madeExactly: number;
}

/**
 * What a doubled contract nets its declarer — made exactly, and down one
 * through three, at both vulnerabilities — asked of `scoreDeal` itself rather
 * than the penalty tables alone, so the claim that making it costs the same
 * either way cannot drift from what a real deal would actually settle.
 */
export function doubledOutcome(options: {
  readonly level: Level;
  readonly strain: Strain;
}): { readonly notVulnerable: DoubledOutcome; readonly vulnerable: DoubledOutcome } {
  const { level, strain } = options;
  const required = level + 6;

  const netTo = (tricksWon: number, declarerVulnerable: boolean): number => {
    const score = scoreDeal(
      {
        contract: { declarer: 0, doubling: "doubled", level, strain },
        hands: NO_HANDS,
        tricksWon: [tricksWon, 13 - tricksWon],
      },
      [declarerVulnerable, false],
    );
    return score.belowLine[0] + score.aboveLine[0] - score.belowLine[1] - score.aboveLine[1];
  };

  const outcomeFor = (declarerVulnerable: boolean): DoubledOutcome => ({
    down: [
      netTo(required - 1, declarerVulnerable),
      netTo(required - 2, declarerVulnerable),
      netTo(required - 3, declarerVulnerable),
    ],
    madeExactly: netTo(required, declarerVulnerable),
  });

  return { notVulnerable: outcomeFor(false), vulnerable: outcomeFor(true) };
}
