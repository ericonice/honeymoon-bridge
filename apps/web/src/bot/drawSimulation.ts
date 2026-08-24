import type { Card, DrawChoice, PlayerView, Rng } from "@hb/engine";
import { keepTest } from "./drawDecision.js";

/**
 * A guessed opponent hand built by replaying the draw they actually had.
 *
 * `sample.ts` draws thirteen cards from the pool and leans on `KEEP_STRENGTH` to
 * make honours likelier, because a uniform draw imagines an opponent five
 * high-card points too weak — they kept their best thirteen of the twenty-six they
 * were shown and a coin flip per card does not. That constant corrects the
 * *average* and leaves the per-deal error alone: how often a seat kept card 1 is
 * public, and it moves their strength from about eleven points at no keeps to
 * twenty at seven, so one number fitted to the mean is wrong by four points at
 * each end.
 *
 * This replaces the constant with the thing it was approximating. Two facts make
 * it possible, and both are peculiar to this game:
 *
 * 1. **The pool is exactly what they saw.** Each seat's thirteen turns consume
 *    twenty-six cards, so the cards this seat cannot place are precisely the
 *    twenty-six the opponent was offered — not a superset to be sampled from.
 * 2. **Their choices are public.** `drawTurns` records, for every turn, whether
 *    they kept the card they were shown or took the unseen one. A hand assembled
 *    from turns where they *chose* the card is selected; one assembled from
 *    sight-unseen takes is close to random.
 *
 * So the simulation is not "shuffle and deal" — that would reproduce a uniform
 * draw however the choices went, since picking the first or second of an arbitrary
 * pair is still arbitrary. It is: at each turn, choose *which* card was the one
 * they were shown, such that the recorded choice is what a draw policy would
 * actually have done. Keeping a card then means the hand receives one the policy
 * liked, and taking the unseen one means it receives a random card while a card the
 * policy disliked goes face down.
 */

export interface DrawSimulationOptions {
  /**
   * The twenty-six cards they were offered. Must be exactly twice the hand size —
   * see `canSimulate`.
   */
  readonly pool: readonly Card[];
  readonly rng: Rng;
  /** Their choices, in order, oldest first. */
  readonly turns: readonly DrawChoice[];
}

/**
 * Whether the draw can be replayed for this view.
 *
 * Only before the opponent has played a card. After that the pool has shrunk by
 * what they played but the hand it has to build has shrunk by the same amount, so
 * there are no longer two cards per turn to deal — and the simulation would also
 * have to *guarantee* the cards they have already played end up in the hand, which
 * is a constraint the draw policy does not take. Card play therefore keeps the
 * weighted draw for now; the auction, where nothing has been played, does not need
 * to.
 *
 * `took-discard` is excluded for a different reason: under the open discard the
 * card they took is *known*, which is a stronger constraint than this models
 * rather than a weaker one, and pretending otherwise would throw information away.
 */
export function canSimulate(pool: readonly Card[], size: number, turns: readonly DrawChoice[]): boolean {
  return (
    turns.length === size &&
    pool.length === size * 2 &&
    turns.every((choice) => choice === "kept-first" || choice === "took-second")
  );
}

/** The opponent's own choices, oldest first. */
export function theirChoices(view: PlayerView): DrawChoice[] {
  return view.drawTurns.filter((turn) => turn.by === view.opponent).map((turn) => turn.choice);
}

function take(pool: Card[], index: number): Card {
  const [card] = pool.splice(index, 1);
  return card!;
}

/**
 * Would a draw policy keep this card, holding this much of a hand?
 *
 * The bot's own policy stands in for theirs, which is the same substitution the
 * bidding design makes for reading an auction: a poor decision-maker is still a
 * serviceable model of what somebody would have decided. Against a person it is a
 * model rather than a measurement.
 *
 * `keepTest` rather than `chooseTake` because this is asked about every card in
 * the pool on every turn, and `chooseTake` recomputes the value of an unknown card
 * each time it is called — see the note there.
 */

/**
 * The hand the draw would have produced, given the choices it produced.
 *
 * The two cards a turn offers are **independent** draws off the stock, and the
 * recorded choice says something about the first one only. So the shown card is
 * drawn from the cards consistent with that choice — keepable on a turn they kept,
 * not keepable on a turn they rejected — and the other card is drawn from whatever
 * is left, unconditioned. Keeping therefore puts a card the policy liked into the
 * hand, and rejecting puts a card nobody looked at into the hand while a card the
 * policy declined goes face down.
 *
 * **The first version got the rejected turn backwards and it cost the whole
 * effect.** It drew a pair, forced the *shown* card to be the unkeepable one, and
 * handed the other over — but "the other one, given this one was unkeepable" is
 * conditionally *good*, where card two was sight-unseen and should be plainly
 * random. Thirteen keeps and thirteen rejects came out at 15.70 and 15.81 points on
 * shuffled pools, indistinguishable, and a test asserting a gap is what found it.
 *
 * Conditioning by partitioning the pool rather than by re-drawing until something
 * fits. Re-drawing was tried and over-selects: it hunts through the pool for a
 * keepable card where the player was shown one card and judged it, which put the
 * guessed hand a point too strong. Splitting the pool and choosing uniformly from
 * the right side is the conditional distribution rather than an approximation of
 * it, and costs about a hundred and eighty policy calls a sample against five
 * solves at seven milliseconds each.
 */
export function simulateDraw(options: DrawSimulationOptions): Card[] {
  const { rng, turns } = options;
  const pool = [...options.pool];
  const hand: Card[] = [];

  for (const choice of turns) {
    const wantKeepable = choice === "kept-first";

    // Every card the shown one could have been, given what they did with it. The
    // threshold is computed once for the hand and applied per card.
    const keeps = keepTest(hand, []);
    const consistent: number[] = [];
    for (let index = 0; index < pool.length; index++) {
      if (keeps(pool[index]!) === wantKeepable) {
        consistent.push(index);
      }
    }

    // A turn where nothing in the pool fits is real — late in a draw there may be
    // no keepable card left — and an unconditioned draw is the honest fallback.
    const shownIndex =
      consistent.length === 0
        ? Math.floor(rng.next() * pool.length)
        : consistent[Math.floor(rng.next() * consistent.length)]!;
    const shown = take(pool, shownIndex);

    // Card two, which nobody saw. Unconditioned, which is the whole correction.
    const other = take(pool, Math.floor(rng.next() * pool.length));

    hand.push(wantKeepable ? shown : other);
  }

  return hand;
}
