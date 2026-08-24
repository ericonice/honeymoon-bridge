import { opponentOf, TRICKS } from "@hb/engine";
import type { Card, Pair, PlayerId, PlayerView, Rng, Strain } from "@hb/engine";
import { sampleOpponentHand } from "./sample.js";
import { solve } from "./solver.js";

/**
 * How many tricks a contract takes, by guessing the other hand and solving.
 *
 * The bidder's counted estimate explains about 40% of what happens and is handed
 * to `bidValue.ts` wrapped in one fixed-width bell curve, so a flat hand with
 * solid honours and a wild two-suiter are given the same uncertainty. This
 * measures the distribution instead of assuming its shape — see `REQUIREMENTS.md`
 * §2.1 for the design.
 *
 * **Anytime, with a deadline, and that is forced rather than chosen.** Timed at
 * the first call, twenty-five samples over five strains costs 102ms on the easiest
 * deal and 5,269ms on the hardest: a fiftyfold spread driven by hand *shape*, not
 * by hardware. A search collapses where there are long suits and clear structure
 * and explodes on flat hands with scattered honours. No sample count works on both,
 * so the budget is time and the count is whatever fits.
 *
 * The corollary is uncomfortable and worth keeping in view: the hands that cost
 * most to search are the ones a counted estimate serves worst, so this gives least
 * accuracy exactly where it would help most.
 */

/** One strain's outcome, as a distribution rather than a number. */
export interface TrickSpread {
  /** How many of the samples gave each trick count, indexed 0 to 13. */
  readonly counts: readonly number[];
  /** Mean tricks for the seat that asked, over the samples taken. */
  readonly mean: number;
  /** Samples that actually completed, which the deadline decides. */
  readonly samples: number;
}

export interface SearchResult {
  /** Milliseconds spent, for the log and for deciding whether the budget is right. */
  readonly elapsedMs: number;
  /** True when the deadline stopped it short of `samples`. */
  readonly ranOut: boolean;
  /** Samples completed, which is what makes a deal replayable — see §2.1. */
  readonly sampled: number;
  readonly spreads: ReadonlyMap<Strain, TrickSpread>;
}

export interface SearchOptions {
  /** Give up after this long. The whole point; see above. */
  readonly budgetMs: number;
  /** Ceiling on samples, reached only on hands that solve quickly. */
  readonly maxSamples: number;
  /** Cards this seat threw away, so they are not dealt to the opponent. */
  readonly remembered?: readonly Card[];
  readonly rng: Rng;
  /** The strains worth pricing. Two or three in practice, not all five. */
  readonly strains: readonly Strain[];
  readonly view: PlayerView;
}

/**
 * Samples are taken in the outer loop and strains in the inner one, deliberately.
 *
 * Every strain has to see the same set of guessed hands or they are not comparable
 * — a strain that happened to be scored against luckier hands would win on the
 * sampling rather than on the cards. Stopping between samples keeps that true:
 * whatever the deadline allows, every strain has been priced against exactly the
 * same worlds. Stopping *within* a sample would leave the last strains short.
 */
export function searchTricks(options: SearchOptions): SearchResult {
  const { budgetMs, maxSamples, remembered = [], rng, strains, view } = options;
  const me = view.me;
  const them = opponentOf(me);
  const started = performance.now();

  const counts = new Map<Strain, number[]>();
  for (const strain of strains) {
    counts.set(strain, new Array<number>(TRICKS + 1).fill(0));
  }

  let sampled = 0;
  let ranOut = false;
  while (sampled < maxSamples) {
    if (sampled > 0 && performance.now() - started >= budgetMs) {
      ranOut = true;
      break;
    }

    const theirs = sampleOpponentHand(view, rng, remembered);
    const hands: Pair<readonly Card[]> = [[], []];
    hands[me] = view.hand;
    hands[them] = theirs;

    for (const strain of strains) {
      // The opponent leads, so this is what *this* seat takes declaring. The
      // solution carries both seats, so defending is the same solve.
      const tricks = solve({ hands, leader: them, strain, trick: [] }).tricks[me];
      const seen = counts.get(strain)!;
      seen[tricks] = (seen[tricks] ?? 0) + 1;
    }
    sampled += 1;
  }

  const spreads = new Map<Strain, TrickSpread>();
  for (const strain of strains) {
    const taken = counts.get(strain)!;
    const total = taken.reduce((sum, one, tricks) => sum + one * tricks, 0);
    spreads.set(strain, {
      counts: taken,
      mean: sampled === 0 ? 0 : total / sampled,
      samples: sampled,
    });
  }

  return { elapsedMs: performance.now() - started, ranOut, sampled, spreads };
}

/**
 * The same distribution seen from the other side of the table.
 *
 * A solve reports both seats and they sum to thirteen, so the chance *they* take
 * `t` tricks is the chance this seat takes `13 - t`. Reversing the array is the
 * whole of it — which is what makes pricing a pass, and a double, cost nothing
 * beyond the search already run for this seat's own contracts.
 */
export function mirrorOdds(odds: readonly number[]): number[] {
  return [...odds].reverse();
}

/**
 * **Not widened, and it was, on a theory formed while the code was broken.**
 * `TRICK_SPREAD` was fitted against how far the estimate lands from what happens,
 * where this measures how far *par* moves across the hands they might hold — no
 * play error in it at all, and the bot gives away 0.36 tricks a deal declaring. The
 * search's own spread is 1.11 tricks against an error of 1.54, so widening looked
 * obviously right.
 *
 * Measured, it is worth nothing: 64.2% of rubbers unwidened, 66.7% at a third of a
 * trick, 65.0% at a full one — all inside each other's error bars. The reasoning
 * was formed while the bidder had two bugs making it timid, and the fix removed the
 * problem the widening was invented to solve. A knob whose effect has never been
 * observed is not a knob.
 *
 * At least one sample, whatever the budget says.
 *
 * A search that returned nothing would have to fall back to the counted estimate,
 * which means two code paths and a bidder whose behaviour depends on how busy the
 * phone was. One sample is a poor distribution and still an answer, so the deadline
 * is checked *after* the first rather than before it — which is why the loop above
 * guards on `sampled > 0`.
 */
export function spreadOdds(spread: TrickSpread): number[] {
  if (spread.samples === 0) {
    return new Array<number>(TRICKS + 1).fill(1 / (TRICKS + 1));
  }

  return spread.counts.map((count) => count / spread.samples);
}
