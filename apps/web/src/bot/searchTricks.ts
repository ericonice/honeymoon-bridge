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
  /**
   * The pairs the opponent was offered, when this seat recognises the board.
   *
   * The auction is where this is worth most and where it is cleanest: nothing has
   * been played, so every one of the thirteen pairs is still open and the guess is
   * one card from each rather than any thirteen of twenty-six.
   */
  readonly theirOffers?: readonly Pair<Card>[] | null;
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
  const { budgetMs, maxSamples, remembered = [], rng, strains, theirOffers = null, view } = options;
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

    const theirs = sampleOpponentHand(view, rng, remembered, theirOffers);
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

  const spreadsFrom = (from: ReadonlyMap<Strain, number[]>): Map<Strain, TrickSpread> => {
    const built = new Map<Strain, TrickSpread>();
    for (const [strain, taken] of from) {
      const total = taken.reduce((sum, one, tricks) => sum + one * tricks, 0);
      built.set(strain, {
        counts: taken,
        mean: sampled === 0 ? 0 : total / sampled,
        samples: sampled,
      });
    }
    return built;
  };

  return {
    elapsedMs: performance.now() - started,
    ranOut,
    sampled,
    spreads: spreadsFrom(counts),
  };
}

/**
 * **This searches one position — what *this* seat takes declaring — and two attempts to
 * make it answer the other one have been removed.**
 *
 * `mirrorOdds` reversed this seat's distribution to price a contract the opponent
 * declares, on the reasoning that a solve reports both seats and they sum to thirteen.
 * The arithmetic is right and the inference is not: the solve it read was taken with
 * the opponent on lead, so reversing it answers "how many tricks do they take *while
 * this seat declares*", which is not a position anybody is in.
 *
 * `SearchOptions.defending` replaced it with the correct version — a second solve with
 * this seat leading — and that is gone too, because the premise under both was never
 * measured and turns out to be false. Over **1,115 real auction positions** where the
 * opponent's contract stands, mean absolute error against double-dummy par:
 *
 * | | tricks |
 * | --- | --- |
 * | counting | **1.10 ± 0.02** |
 * | searching | 1.14 ± 0.03 |
 * | paired difference | **−0.05 ± 0.03 against searching** |
 *
 * So a searched defending estimate is *not* more accurate — slightly worse, at about
 * two standard errors on a paired comparison. The 1.04-against-1.54 figure that
 * motivated all of this is a **declaring** number and does not transfer: solving a
 * position depends on guessing the hand you cannot see, and this seat's read of a hand
 * the opponent has *bid* is exactly the weak one — which is why `impliedByTheirBid`
 * exists and carries a weight of 0.75.
 *
 * That explains two nulls rather than leaving them unexplained: 46.6% ± 2.8 over 320
 * rubbers, and 47.9% against 48.9% over 200 matchpointed boards. See `bench/defendpar.ts`,
 * which is kept so the claim can be re-checked rather than taken on trust.
 */

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
