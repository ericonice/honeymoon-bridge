import { SUITS } from "@hb/engine";
import type { Card, Rank, Strain, Suit } from "@hb/engine";

const HIGH_CARD_POINTS: Partial<Record<Rank, number>> = { 11: 1, 12: 2, 13: 3, 14: 4 };

const SUIT_LENGTH = 13;

/**
 * The share of the cards this hand cannot account for that are in the other one.
 *
 * Thirteen of thirty-nine, because the other twenty-six were never dealt. This
 * single number is most of what separates honeymoon bridge from bridge, and it
 * is why small cards are worth so much more here: a suit you hold four of leaves
 * nine outstanding, of which the opponent holds three, so your fourth-highest is
 * often already high.
 *
 * It belongs in hand evaluation for the same reason it belongs in card play.
 * Everything below is one of two questions asked of it — how many of theirs are
 * left, and have mine outlasted them.
 */
const THEIRS = 1 / 3;

/**
 * How much of a suit's run-out actually cashes at no-trump.
 *
 * Outliving the opponent's holding is necessary but not sufficient: the small
 * cards still have to be reached, and while you are finding an entry they are
 * cashing a suit of their own. Counting the run-out in full made no-trump worth
 * 1.3 tricks more than measurement allowed, against suits that were 0.3 short.
 * Fitted to bring the two into line.
 */
const RUNOUT = 0.7;

/**
 * How many of a suit the opponent holds, as a distribution rather than a mean.
 *
 * Taking the mean and rounding is what the old constants did, and it throws away
 * exactly the thing that matters. A three-card holding leaves ten outstanding
 * and they hold 3.3 of them *on average* — so on average your third card is
 * dead. But they hold two or fewer about three times in ten, and in those deals
 * it wins. Averaging first loses that tail entirely; the whole undervaluation of
 * no-trump traces back to it.
 */
function outstandingOdds(missing: number, share: number): number[] {
  const odds: number[] = [];
  for (let held = 0; held <= missing; held++) {
    let ways = 1;
    for (let step = 0; step < held; step++) {
      ways = (ways * (missing - step)) / (step + 1);
    }
    odds.push(ways * share ** held * (1 - share) ** (missing - held));
  }
  return odds;
}

/**
 * Their share of a suit they have *bid*.
 *
 * The one inference a two-player auction offers, and the whole of it: they would
 * not have named a suit they were short in. There are no conventions here and no
 * partner to be talking to, so a bid means what it appears to mean — §1.5 calls
 * the auction pure competitive negotiation, and this is the negotiating.
 *
 * It goes here rather than into a special case in the bidder because the model
 * already had the slot. Everything about this evaluation is downstream of how
 * much of a suit the other hand holds; a bid is evidence about exactly that
 * number, so reading the auction means using a different one.
 */
const THEIRS_BID = 0.5;

function oddsTable(share: number): readonly (readonly number[])[] {
  return Array.from({ length: SUIT_LENGTH + 1 }, (_, missing) => outstandingOdds(missing, share));
}

const ODDS = oddsTable(THEIRS);
const ODDS_BID = oddsTable(THEIRS_BID);

/** The chance they hold no more of the suit than `count`, so anything below it runs. */
function exhaustedBy(missing: number, count: number, bid: boolean): number {
  return (bid ? ODDS_BID : ODDS)[missing]!.reduce(
    (total, odds, held) => (held <= count ? total + odds : total),
    0,
  );
}

/** How many of theirs are left over once `count` of mine have drawn what they can. */
function surplusOver(missing: number, count: number, bid: boolean): number {
  return (bid ? ODDS_BID : ODDS)[missing]!.reduce(
    (total, odds, held) => total + odds * Math.max(0, held - count),
    0,
  );
}

/**
 * Honors held in an unbroken run down from the ace.
 *
 * Distinct from `quickTricks`, which answers how many tricks a *side suit*
 * produces and sensibly stops at two because a third round tends to be ruffed.
 * This answers a different question — how many of their cards mine can drag out
 * before one of mine loses — so it does not stop, and it breaks at the first
 * missing card. AKQ draws three; AK32 draws two, because the queen is missing
 * and the small cards have to fight for themselves.
 */
function topRun(cards: readonly Card[]): number {
  const ranks = new Set(cards.map((card) => card.rank));
  let run = 0;
  while (ranks.has((14 - run) as Rank)) {
    run += 1;
  }
  return run;
}

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
 * So honors count on their own merit here, capped by the length of the suit:
 * no holding can win more tricks than it has cards.
 */
export function potentialTricks(cards: readonly Card[]): number {
  const ranks = new Set(cards.map((card) => card.rank));
  const raw =
    (ranks.has(14) ? 1 : 0) + (ranks.has(13) ? 0.5 : 0) + (ranks.has(12) ? 0.25 : 0);
  return Math.min(cards.length, raw);
}

/** Winners the hand expects on defense, which is what makes a double worth risking. */
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
 * and a nine is often high.
 *
 * Fitted three times against deals the bot had itself bid and played, which was
 * circular twice over: the contracts in the sample were the ones the previous
 * constants chose, and the tricks in it were whatever the previous card play
 * managed. Each fit was therefore measuring the bot as much as the cards, and
 * each disagreed with the one before it.
 *
 * Fitted now against par, computed by the solver for every hand in every strain
 * whether or not anything would bid it, which removes both circularities: the
 * sample is the hands themselves rather than the auctions they produced. Par is
 * a fair target for this bot specifically because measurement says it is — the
 * sampling bot gives away almost exactly as much on defense as on offense, so
 * declarer's tricks land within a rounding error of par. That equivalence is a
 * property of the current card play, not a law. If the two sides ever diverge,
 * this has to go back to measuring played deals.
 *
 * Both numbers are now the regression's, and the reason is worth keeping,
 * because for three fits running they were not. The intercept used to be nudged
 * about half a trick above least squares and settled by outcome instead — raised
 * until over- and undertricks balanced. That was the right thing to do for a
 * bidder that asked "can I make this", because such a bidder has nowhere else to
 * put a risk preference: the estimate was the only dial, so the estimate had to
 * carry it.
 *
 * `bidValue.ts` prices risk explicitly now, so it does not need the estimate to
 * lean. Leaving the optimism in double-counted it, and half a trick of optimism
 * on both sides of a competitive auction compounds — the two bots pushed each
 * other to the four and five level and got doubled there, taking the make rate
 * down to 42%. Removing it restored 64%, and `bench/auction.ts` prints the
 * auctions if it ever comes back.
 *
 * The general form: **an estimate should be accurate, and whatever wants to be
 * cautious should be cautious somewhere you can see it.**
 *
 * Two rules this keeps proving. Anything that changes how well the bot plays
 * invalidates this fit. And the fit cannot rescue a bad feature: r-squared is
 * 0.50 and the residual is still ±1.3 tricks, which is the evaluation being
 * approximate rather than the line through it being wrong. `bench/calibrate.ts`
 * re-measures all of this; re-measure rather than reason about it.
 */
const CALIBRATION = { intercept: 3.66, slope: 0.735 };

/**
 * `bid` says the opponent has named this strain during the auction, which makes
 * the hand worth less in it: their length is evidence against your own. Only the
 * declaring estimate takes it, because the defending one is fitted against the
 * strain a declarer would actually pick and so already has it baked in — passing
 * it to both would count the same inference twice.
 */
export function estimatedTricks(hand: readonly Card[], strain: Strain, bid = false): number {
  return tricksFromRaw(rawTricks({ bid, hand, strain }));
}

/** The calibration on its own, for a raw count already taken. Refitting measures this directly. */
export function tricksFromRaw(raw: number): number {
  return CALIBRATION.intercept + CALIBRATION.slope * raw;
}

/**
 * The same hand, the same strain, read from the other side of the table.
 *
 * The bidder cannot price passing without this. Passing hands the deal to the
 * opponent's contract, and what that costs depends on how many tricks *this*
 * hand takes against it — which is not one minus what it would take declaring,
 * because declaring and defending are different jobs. Long trumps are worth
 * ruffs rather than draws, and the lead is theirs.
 *
 * Without it the only assumption available is that they make exactly what they
 * bid, and that assumption is not neutral: it makes defending look hopeless, so
 * every sacrifice beats passing and two bots talk each other up to the seven
 * level. Fitted the same way as the other, against par from the defending seat.
 */
const DEFENSE_CALIBRATION = { intercept: 1.96, slope: 0.858 };

export function defenseFromRaw(raw: number): number {
  return DEFENSE_CALIBRATION.intercept + DEFENSE_CALIBRATION.slope * raw;
}

/** Tricks this hand expects to take defending against a contract in this strain. */
export function defendingTricks(hand: readonly Card[], strain: Strain): number {
  return defenseFromRaw(rawTricks({ hand, strain }));
}

type Winners = (cards: readonly Card[]) => number;

export interface RawTricksOptions {
  /** The opponent has named this strain, so they are longer in it than chance. */
  readonly bid?: boolean;
  readonly hand: readonly Card[];
  readonly strain: Strain;
  readonly winners?: Winners;
}

/** Winners the hand can point at, before calibration. Exported so the fit can be re-measured. */
export function rawTricks(options: RawTricksOptions): number {
  const { bid = false, hand, strain, winners = quickTricks } = options;

  if (strain === "NT") {
    // No-trump names no suit, so a bid of it says nothing about where their
    // length lies and there is nothing here to condition on.
    return SUITS.reduce(
      (total, suit) => total + noTrumpTricks(cardsIn(hand, suit), winners, false),
      0,
    );
  }

  // Side suits are counted on their winners alone, with no credit for length.
  // That is not an oversight: length only cashes if nobody ruffs it, which is
  // exactly what a trump contract puts at risk and what no-trump does not. This
  // asymmetry is what lets a balanced hand prefer no-trump at all.
  const side = SUITS.reduce(
    (total, suit) => (suit === strain ? total : total + winners(cardsIn(hand, suit))),
    0,
  );
  return trumpTricks(cardsIn(hand, strain), bid) + side;
}

/**
 * Tricks a suit produces at no-trump: its winners, plus the cards underneath
 * them for the share of deals in which the opponent has already run out.
 *
 * AK4 is worth about 2.3 rather than 2 — the four is dead whenever they hold
 * three or more, and alive when they do not, which is often enough to matter
 * across four suits. Counting only the certain cards is what left no-trump
 * chronically undervalued.
 */
function noTrumpTricks(cards: readonly Card[], winners: Winners, bid: boolean): number {
  const run = topRun(cards);
  const beneath = cards.length - run;
  return winners(cards) + RUNOUT * beneath * exhaustedBy(SUIT_LENGTH - cards.length, run, bid);
}

/**
 * Tricks a trump holding wins.
 *
 * This counted length alone until it was measured, which made AKQ and 8765
 * worth the same as trumps — trump honors registered nowhere, since the
 * no-trump branch was the only place honors were read and there they are not
 * trumps.
 *
 * What a trump holding really loses is the trumps left in the other hand once
 * the run down from the ace has dragged out what it can. Everything else in the
 * suit wins, either by being high or by ruffing. So AKQ concedes only their
 * fourth trump if they have one, while 8765 concedes about three.
 */
function trumpTricks(trumps: readonly Card[], bid: boolean): number {
  return Math.max(
    0,
    trumps.length - surplusOver(SUIT_LENGTH - trumps.length, topRun(trumps), bid),
  );
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
 * `growing` says the hand is still being dealt, and switches the honor rules
 * from finished-hand ones to `potentialTricks`. Without it the draw judges a
 * lone king as bare when it is merely early.
 */
/**
 * A note on what was tried here and did not work, because it sounds right.
 *
 * Everything below `rawTricks` asks how many of a suit the *other* hand holds,
 * counted against a full thirteen — which is a finished-hand assumption, and
 * exactly the kind `potentialTricks` exists to correct for honors. Applied to a
 * hand on turn one it says a lone card wins nothing, so early in the draw every
 * card without an honor scores identically at zero and the bot cannot tell a
 * card in the suit it is building from a card in a suit it is not.
 *
 * Scaling the opponent's holding by how far along the hand is fixes that, and
 * **measured 0.39 tricks a deal worse** — `bench/draw.ts`, against a fixed
 * reference, about two and a half standard errors. The reason is that early in
 * the draw the scarce thing is honors, not length: there are twelve turns left
 * to build a suit and no way at all to manufacture an ace. Crediting early
 * length made the bot keep filler over honors, and a test asserting it keeps a
 * queen on turn one caught it before the bench did.
 *
 * So the thresholds are left alone deliberately. They are not a finished-hand
 * rule misapplied; they are correctly declining to pay for length that has not
 * happened yet.
 */
export function rawHandValue(hand: readonly Card[], growing = false): number {
  const winners = growing ? potentialTricks : quickTricks;
  let best = rawTricks({ hand, strain: "NT", winners });
  for (const suit of SUITS) {
    best = Math.max(best, rawTricks({ hand, strain: suit, winners }));
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
