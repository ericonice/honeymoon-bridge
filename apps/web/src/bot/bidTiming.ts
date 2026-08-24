import { opponentOf, STRAINS } from "@hb/engine";
import type { Card, Pair, PlayerView, Rng, Strain } from "@hb/engine";
import { sampleOpponentHand } from "./sample.js";
import { solve } from "./solver.js";

/**
 * What it would cost to bid by searching instead of by counting.
 *
 * The bidder is the last decision in here made with a rule of thumb: it counts a
 * hand's tricks with `evaluate.ts` and then spreads a fixed-width bell curve over
 * that guess. Card play stopped doing anything of the kind long ago — it guesses
 * the hand it cannot see twenty-five times over and solves each guess exactly —
 * and that change was the largest single improvement the bot has had.
 *
 * The reason bidding never got the same treatment is cost, and cost is the one
 * thing nobody has measured. So this measures it, and measures it *before* any
 * bidding logic is built on top: the naive shape of that feature — re-evaluate
 * every candidate contract on every call — is almost certainly too slow, and it is
 * much cheaper to learn that from twenty lines than from an auction that stalls on
 * somebody's phone.
 *
 * Nothing here decides anything. It does the work and reports how long the work
 * took.
 */

/**
 * One solve answers a whole strain, which is what makes any of this affordable.
 *
 * Double dummy depends on the strain and not on the level: 4♥ and 5♥ are the same
 * position and the same answer. So the cost is (strains considered) × (samples),
 * not (candidate contracts) × (samples) — and since a solve reports both seats'
 * tricks, the same pass prices this hand declaring *and* defending.
 */
export interface BidTiming {
  /** Milliseconds per solve, which is the number that scales. */
  readonly perSolveMs: number;
  readonly samples: number;
  /** Milliseconds spent guessing hands rather than solving them. */
  readonly samplingMs: number;
  readonly solves: number;
  readonly strains: readonly Strain[];
  readonly totalMs: number;
  /**
   * Tricks this seat takes as declarer, averaged over the samples, per strain.
   *
   * Reported so a run can be seen to have done real work. A timing harness that
   * measured an empty loop would look wonderfully fast.
   */
  readonly tricks: Readonly<Record<string, number>>;
}

export interface BidTimingOptions {
  /** Cards this seat threw away and therefore knows are not in the other hand. */
  readonly remembered?: readonly Card[];
  readonly rng: Rng;
  readonly samples: number;
  /** Defaults to all five. The real feature would consider two or three. */
  readonly strains?: readonly Strain[];
  readonly view: PlayerView;
}

/**
 * Times one full pass: guess a hand, solve it in every strain, repeat.
 *
 * Called at a seat's first turn to call, which is the worst case — thirteen cards
 * each and no tricks played, so every solve is a full thirteen-trick search with
 * none of the discount that makes card play cheaper as a deal goes on.
 */
export function timeBidSearch(options: BidTimingOptions): BidTiming {
  const { remembered = [], rng, samples, view } = options;
  const strains = options.strains ?? STRAINS;
  const me = view.me;
  const them = opponentOf(me);

  const totals = new Map<string, number>();
  let samplingMs = 0;
  const started = performance.now();

  for (let sample = 0; sample < samples; sample++) {
    const sampledAt = performance.now();
    const theirs = sampleOpponentHand(view, rng, remembered);
    samplingMs += performance.now() - sampledAt;

    const hands: Pair<readonly Card[]> = [[], []];
    hands[me] = view.hand;
    hands[them] = theirs;

    for (const strain of strains) {
      // Leader is the seat that did not declare, so this asks what *this* hand
      // takes declaring. The solution carries both seats, so defending is free.
      const solution = solve({ hands, leader: them, strain, trick: [] });
      totals.set(strain, (totals.get(strain) ?? 0) + solution.tricks[me]);
    }
  }

  const totalMs = performance.now() - started;
  const solves = samples * strains.length;
  const tricks: Record<string, number> = {};
  for (const strain of strains) {
    tricks[strain] = (totals.get(strain) ?? 0) / Math.max(1, samples);
  }

  return {
    perSolveMs: solves === 0 ? 0 : (totalMs - samplingMs) / solves,
    samples,
    samplingMs,
    solves,
    strains,
    totalMs,
    tricks,
  };
}
