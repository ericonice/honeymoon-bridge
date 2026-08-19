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
export function topRun(cards: readonly Card[]): number {
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
const CALIBRATION = { intercept: 3.68, slope: 0.708 };

/**
 * `bid` says the opponent has named this strain during the auction, which makes
 * the hand worth less in it: their length is evidence against your own. Only the
 * declaring estimate takes it, because the defending one is fitted against the
 * strain a declarer would actually pick and so already has it baked in — passing
 * it to both would count the same inference twice.
 */
export function estimatedTricks(hand: readonly Card[], strain: Strain, bid = false): number {
  return tricksFromRaw(rawTricks({ bid, declaring: true, hand, strain }));
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
const DEFENSE_CALIBRATION = { intercept: 2.01, slope: 0.826 };

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
  /**
   * Whether this is a declarer's estimate rather than a defender's or the
   * draw-phase valuation's. Gates the third-or-later card of an unbroken run
   * (`runOutTricks`'s `extraRun`) — `quickTricks` caps at two by design for a
   * defender, whose third-round winner needs the first two rounds gone first
   * and by then the lead is often elsewhere, and `potentialTricks` is asking a
   * different question again for a hand still being drawn. A declarer with
   * the lead has neither problem, so this is off by default and only
   * `estimatedTricks` turns it on.
   */
  readonly declaring?: boolean;
  readonly hand: readonly Card[];
  readonly strain: Strain;
  readonly winners?: Winners;
}

/** Winners the hand can point at, before calibration. Exported so the fit can be re-measured. */
export function rawTricks(options: RawTricksOptions): number {
  const { bid = false, declaring = false, hand, strain, winners = quickTricks } = options;

  if (strain === "NT") {
    // No-trump names no suit, so a bid of it says nothing about where their
    // length lies and there is nothing here to condition on.
    const suits = SUITS.reduce(
      (total, suit) => total + runOutTricks(cardsIn(hand, suit), winners, false, 1, declaring),
      0,
    );
    return suits - (declaring ? RACE_COST * raceLength(hand) : 0);
  }

  const trumps = cardsIn(hand, strain);

  // A side suit's length only cashes once nothing is left to ruff it, so its
  // run-out credit is the same one no-trump gets, discounted by the chance
  // this hand's own trump run has already drawn theirs. `trumpsDrawn` is that
  // chance — reusing `exhaustedBy` on the trump suit itself, the same
  // question `trumpTricks` below asks of it. A short or honor-thin trump suit
  // rarely clears them in time, so a balanced hand still gets next to nothing
  // here; this only pays out once the trump suit is genuinely doing the
  // clearing, which is what lets a balanced hand still prefer no-trump.
  const trumpsDrawn = exhaustedBy(SUIT_LENGTH - trumps.length, topRun(trumps), bid);
  const side = SUITS.reduce(
    (total, suit) =>
      suit === strain
        ? total
        : total + runOutTricks(cardsIn(hand, suit), winners, false, trumpsDrawn, declaring),
    0,
  );
  const ruffs = declaring ? voidRuffTricks(hand, strain, trumps.length) : 0;
  return trumpTricks(trumps, bid) + side + ruffs;
}

/**
 * What losing the race costs at no-trump, per card of it.
 *
 * The one thing the rest of this file counts as though it were free: a winner is
 * only worth counting if the hand gets to cash it. With no dummy and no partner,
 * a suit this hand cannot stop is run to the end, and each trick of it forces a
 * discard from exactly the winners `runOutTricks` has just finished adding up.
 * Under a trump contract that cannot happen — the hand ruffs and takes the lead
 * back — which is why this is the no-trump branch only, and why it is the term
 * that lets a hand prefer a suit contract for a reason other than length.
 *
 * Measured before it was written, and the trend is about as clean as this file
 * gets: bias against par over 800 declaring-in-no-trump hands ran +0.31, +0.86,
 * +1.25, +1.98, +3.07 as the unstopped length went from two or fewer up to six or
 * more. A single affine calibration cannot remove that, because it is a bias in
 * one strain and the calibration serves all five — which is precisely what
 * `bench/calibrate.ts`'s per-strain breakdown exists to catch, and it had been
 * reading +1.22 on no-trump for some time.
 *
 * Fitted against those buckets. The tail is worse than any bucket mean suggests,
 * because the damage compounds — six cards of a suit run against a singleton is
 * six of this hand's winners thrown away, not one — but this is an estimate over
 * hands rather than a reading of one deal, so it prices the average race and the
 * distribution below is what keeps it honest about the spread.
 */
const RACE_COST = 0.85;

/**
 * The race every hand runs, which is already paid for.
 *
 * Charging the whole of `raceLength` was wrong and failed loudly: no-trump went
 * from the best strain on 41 hands in 800 to *one*, which is the same collapse
 * the trump-honor fix caused from the other direction and the reason
 * `bench/calibrate.ts` now counts how often each strain is chosen rather than only
 * how biased it is. Every hand has a shortest suit, so every hand loses some
 * race; a flat 4-3-3-3 already expects about 0.9 cards of it. That much is inside
 * the fitted intercept, because the intercept was fitted over hands that all had
 * it. Only the excess over an ordinary hand's race is a reason to prefer a trump
 * contract, and only the excess is charged here.
 *
 * Which is the same shape as the discovery underneath the whole model: what
 * matters is never the level of a quantity but how far this hand departs from
 * what an average one holds.
 */
const RACE_FREE = 0.9;

/**
 * How far the opponent's longest suit outruns this hand's holding in it, averaged
 * over how that suit can lie.
 *
 * The max over suits rather than the sum: they only get one run before the lead
 * comes back, so it is the worst suit that decides the race and the others are
 * already priced by their own run-out credit. This hand's shortest suit is
 * therefore usually the answer — a 4-4-4-1 hand has twelve cards outstanding
 * opposite its singleton and they hold four of them on average, so three cash.
 *
 * `surplusOver` is already exactly this expectation — "how many of theirs are
 * left once `count` of mine have drawn what they can" — asked with this hand's
 * own length as the count. It is taken over the whole distribution rather than
 * off the mean holding for the reason the rest of this file keeps rediscovering:
 * `max(0, …)` is not linear, so averaging the holding first and subtracting after
 * would price the deals where they are short as though they still cost something.
 */
function raceLength(hand: readonly Card[]): number {
  const worst = SUITS.reduce((longest, suit) => {
    const mine = cardsIn(hand, suit).length;
    return Math.max(longest, surplusOver(SUIT_LENGTH - mine, mine, false));
  }, 0);
  return Math.max(0, worst - RACE_FREE);
}

/**
 * What a void side suit steals from the *opponent's* length in it, rather
 * than from anything of this hand's own.
 *
 * `trumpTricks` above already prices every one of this hand's trump cards
 * regardless of which trick each ends up winning — cashed in its own suit or
 * spent ruffing elsewhere is the same one trick to that count, so nothing
 * here double-charges it. What that count cannot see is the *other* side:
 * the opponent's own cards in a suit this hand holds none of, which would
 * simply win for them at no cost, lose instead whenever the lead runs into a
 * hand that can still ruff it. `VOID_RUFF_CREDIT` is a flat stand-in for how
 * much of that a void is typically worth; `trumpLength / 3` is the one thing
 * this scales on — the fewer trumps behind the void, the sooner they run out
 * and the less of it ever gets ruffed. Only for a declaring hand: the
 * `shortest side` bucket in `bench/calibrate.ts` did not show the same
 * pattern on defense, so this is not applied there.
 */
const VOID_RUFF_CREDIT = 0.65;

function voidRuffTricks(hand: readonly Card[], strain: Strain, trumpLength: number): number {
  return SUITS.reduce((total, suit) => {
    if (suit === strain || cardsIn(hand, suit).length > 0) {
      return total;
    }
    return total + VOID_RUFF_CREDIT * Math.min(1, trumpLength / 3);
  }, 0);
}

/**
 * A suit's certain winners, plus two things beyond them a declarer can also
 * bank on — scaled by `discount`, the chance nothing is left to ruff either
 * one even once it is high.
 *
 * The first is the cards underneath the winners, for the share of deals in
 * which the opponent has already run out: at no-trump `discount` is always 1,
 * so AK4 is worth about 2.3 rather than 2 unconditionally — the four is dead
 * whenever they hold three or more, alive when they do not, which is often
 * enough to matter across four suits. Counting only the certain cards is what
 * left no-trump chronically undervalued.
 *
 * The second, gated by `declaring`, is the third-or-later card of an unbroken
 * run beyond what `winners` already caps at two: AKQ cashes all three,
 * guaranteed, regardless of how the other ten cards split, because nothing
 * outranks them — a defender's cap at two exists for a different reason (the
 * lead is usually gone by the third round) and does not apply here. What does
 * apply is the same risk the run-out credit already prices: a side suit's
 * third round *can* be ruffed under a trump contract even though nothing
 * outranks it, so `extraRun` takes the same `discount` the run-out credit
 * does, and only no-trump — where nothing ruffs at all — gets it in full.
 */
function runOutTricks(
  cards: readonly Card[],
  winners: Winners,
  bid: boolean,
  discount: number,
  declaring: boolean,
): number {
  const run = topRun(cards);
  const safe = winners(cards);
  const extraRun = declaring ? Math.max(0, run - safe) : 0;
  const beneath = cards.length - run;
  return (
    safe + discount * (extraRun + RUNOUT * beneath * exhaustedBy(SUIT_LENGTH - cards.length, run, bid))
  );
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
/**
 * How much of a growing hand's worth is taken from defending rather than declaring.
 *
 * **A hand being dealt does not yet know which side of the auction it will be on**,
 * and the two sides pay for completely different cards. `rawTricks` values a hand
 * as declarer in its best strain, and by that measure a low card added to an
 * already-long suit beats an ace: an extra trump is a winner *and* one fewer trump
 * left in the other hand, which `trumpTricks` prices at about 1.33 against an ace's
 * flat 1.0. That arithmetic is right about a spade contract and silent about the
 * deal where somebody else plays it — where the sixth spade is worth nothing at all
 * and the ace is still worth a trick.
 *
 * Measured before it was written, over ~3,700 part-built hands offered an ace they
 * could take: the undiluted declaring value passed it up **5.2% of the time**, and
 * the cases were all one shape — a low card in a five- or six-card suit scoring
 * 1.32 against the ace's 1.00. Blending in what the hand is worth on defense fixes
 * exactly those, because an ace scores in both terms and a low trump scores in one.
 *
 * **Fitted to that behavior, not to hand quality**, and the two columns are why.
 * Refusals, and how many of them had an honor as card 1 — the defensible ones,
 * where card 1 fills out a holding the hand already has:
 *
 *     weight   refused   card 1 an honor
 *     0.00      5.25%          21%
 *     0.20      4.60%          24%
 *     0.25      1.46%          74%
 *     0.30      0.97%         100%
 *     0.50      0.41%         100%
 *
 * 0.3 is the first weight at which **no low card ever beats an ace** and the
 * transition either side of it is sharp. Above it nothing improves on that
 * criterion; it only starts refusing aces in the honor cases too, which are the
 * ones that were right all along — a king added to a suit already holding the
 * queen gains half a trick on defense *and* its length, so it should still outbid
 * an offside ace. A fix that made the draw stop building suits would be a worse bot
 * than the one that passed up aces.
 *
 * **Worth nothing measurable in hand quality, and that is expected.** Against the
 * same policy at weight 0 over 400 deals: +0.04 ± 0.10 tricks, 337 hands to 333 —
 * because it flips only 1.3% of draw decisions, which are by construction the ones
 * already on a knife edge. Same shape as the recall finding: shifting a mean by a
 * little changes almost no decisions. This is here because passing up a visible ace
 * looks broken to somebody watching, which is a reason a trick metric cannot see
 * and not a reason to pretend it measured well.
 */
export const DEFENSE_SHARE = 0.3;

export function rawHandValue(
  hand: readonly Card[],
  growing = false,
  defenseShare = DEFENSE_SHARE,
): number {
  const winners = growing ? potentialTricks : quickTricks;
  let best = rawTricks({ hand, strain: "NT", winners });
  for (const suit of SUITS) {
    best = Math.max(best, rawTricks({ hand, strain: suit, winners }));
  }
  if (!growing) {
    return best;
  }

  // The same winner count `rawTricks` uses, summed across all four suits instead
  // of being read through one strain — which is what a defender holds, since
  // nothing they hold is trumps and no length of theirs cashes.
  const defending = SUITS.reduce((total, suit) => total + winners(cardsIn(hand, suit)), 0);
  return best * (1 - defenseShare) + defending * defenseShare;
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
