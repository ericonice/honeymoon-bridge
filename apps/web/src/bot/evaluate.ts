import { SUITS } from "@hb/engine";
import type { Card, Rank, Strain, Suit } from "@hb/engine";

const HIGH_CARD_POINTS: Partial<Record<Rank, number>> = { 11: 1, 12: 2, 13: 3, 14: 4 };

/**
 * Trumps past the first two are expected to win. The first two pay for the
 * defender's holding — with half the deck out of play a suit is often short on
 * the other side, which is why this is two rather than the three a full deck
 * would justify.
 */
const TRUMP_OVERHEAD = 2;

/** What each card past the fourth in a long suit is worth at no-trump. */
const LONG_SUIT_VALUE = 0.5;

export function highCardPoints(cards: readonly Card[]): number {
  return cards.reduce((total, card) => total + (HIGH_CARD_POINTS[card.rank] ?? 0), 0);
}

export function cardsIn(hand: readonly Card[], suit: Suit): Card[] {
  return hand.filter((card) => card.suit === suit);
}

/**
 * Winners one suit holding is expected to produce on its own.
 *
 * Deliberately in halves rather than whole tricks: a king wins about half the
 * time, and rounding that up or down at the level of a single suit turns into a
 * whole trick of error across four of them.
 */
export function quickTricks(cards: readonly Card[]): number {
  const ranks = new Set(cards.map((card) => card.rank));
  const ace = ranks.has(14);
  const king = ranks.has(13);
  const queen = ranks.has(12);

  if (ace && king) {
    return 2;
  }
  if (ace && queen) {
    return 1.5;
  }
  if (ace) {
    return 1;
  }
  if (king && queen) {
    return 1;
  }
  if (king) {
    // A bare king falls to the ace; one with a card to spare usually survives.
    return cards.length > 1 ? 0.5 : 0;
  }
  return 0;
}

/**
 * As `quickTricks`, but for a hand that is still being built.
 *
 * The guard rules describe a *finished* hand: a bare king really does fall to
 * the ace, and a lone queen really is worthless. Applied to a hand part-way
 * through the draw they are simply wrong — a lone king on the first turn is not
 * bare, it is early, and there are twelve turns left for it to be joined.
 * Judging it as bare made the bot throw kings away on turn one.
 *
 * So honours count on their own merit here, capped by the length of the suit:
 * no holding can win more tricks than it has cards.
 */
export function potentialTricks(cards: readonly Card[]): number {
  const ranks = new Set(cards.map((card) => card.rank));
  const raw =
    (ranks.has(14) ? 1 : 0) + (ranks.has(13) ? 0.5 : 0) + (ranks.has(12) ? 0.25 : 0);
  return Math.min(cards.length, raw);
}

/** Winners the hand expects on defence, which is what makes a double worth risking. */
export function defensiveTricks(hand: readonly Card[]): number {
  return SUITS.reduce((total, suit) => total + quickTricks(cardsIn(hand, suit)), 0);
}

/**
 * Tricks this hand expects to take as declarer in a given strain.
 *
 * There is no partner and no dummy, so this is the whole estimate — not half of
 * a partnership's. That is why it counts playing tricks rather than the point
 * totals ordinary bridge uses to find a fit: there is no fit to find.
 */
/**
 * Turns raw playing tricks into tricks actually taken.
 *
 * Counting winners badly under-predicts: it only credits the cards that are
 * certain, while in practice a good deal of the hand's length and its middle
 * cards win tricks too — the more so here, where half the deck is out of play
 * and a nine is often high. Fitted by least squares over 4000 deals in which
 * the declarer played their best strain: raw averaged 4.1 against 7.6 actually
 * taken, slope 0.76.
 *
 * Refit once already, after the bot learned to draw: better hands pushed the
 * predictions into a range where the first fit over-predicted by 0.66 tricks.
 * Only the intercept moved — across a narrower band of stronger hands the slope
 * is the less reliable of the two, and the bias is the part the evidence
 * actually supports.
 *
 * Refit again once the bot learned to play its cards, which is worth about a
 * trick a deal and left it bidding a full overtrick short. The intercept is
 * settled by outcome rather than by the regression alone: at 4.85 the bot makes
 * about 67% of its contracts with over- and undertricks balanced (0.67 against
 * 0.57), which is where a bidder that neither overreaches nor leaves points
 * below the line should land.
 *
 * The rule this keeps proving: **anything that changes how well the bot plays
 * invalidates this fit.** Re-measure rather than reason about it.
 */
const CALIBRATION = { intercept: 4.85, slope: 0.76 };

export function estimatedTricks(hand: readonly Card[], strain: Strain): number {
  return CALIBRATION.intercept + CALIBRATION.slope * rawTricks(hand, strain);
}

type Winners = (cards: readonly Card[]) => number;

/** Winners the hand can point at, before calibration. */
function rawTricks(hand: readonly Card[], strain: Strain, winners: Winners = quickTricks): number {
  if (strain === "NT") {
    return SUITS.reduce((total, suit) => {
      const cards = cardsIn(hand, suit);
      const length = cards.length > 4 ? (cards.length - 4) * LONG_SUIT_VALUE : 0;
      return total + winners(cards) + length;
    }, 0);
  }

  const trumps = cardsIn(hand, strain).length;
  const side = SUITS.reduce(
    (total, suit) => (suit === strain ? total : total + winners(cardsIn(hand, suit))),
    0,
  );
  return Math.max(0, trumps - TRUMP_OVERHEAD) + side;
}

/**
 * The hand's raw worth in its best strain, before calibration.
 *
 * Used for comparing one hand against another rather than for predicting a
 * contract, which is why it skips the calibration: that is an affine transform,
 * so it cannot change which of two hands is better, and leaving it out avoids
 * implying these numbers mean tricks. It is also defined for a part-built hand,
 * where a trick count would be meaningless.
 *
 * `growing` says the hand is still being dealt, and switches the honour rules
 * from finished-hand ones to `potentialTricks`. Without it the draw judges a
 * lone king as bare when it is merely early.
 */
export function rawHandValue(hand: readonly Card[], growing = false): number {
  const winners = growing ? potentialTricks : quickTricks;
  let best = rawTricks(hand, "NT", winners);
  for (const suit of SUITS) {
    best = Math.max(best, rawTricks(hand, suit, winners));
  }
  return best;
}

export interface Evaluation {
  readonly strain: Strain;
  readonly tricks: number;
}

/** The strain this hand plays best in, and what it is worth there. */
export function bestStrain(hand: readonly Card[]): Evaluation {
  let best: Evaluation = { strain: "NT", tricks: estimatedTricks(hand, "NT") };
  for (const suit of SUITS) {
    const tricks = estimatedTricks(hand, suit);
    if (tricks > best.tricks) {
      best = { strain: suit, tricks };
    }
  }
  return best;
}
