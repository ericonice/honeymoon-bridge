import { applyDealScore, opponentOf, scoreDeal, totalScore } from "@hb/engine";
import type { Card, Contract, Pair, PlayerId, RubberState } from "@hb/engine";
import { equityOf } from "./equity.js";
import type { Standing } from "./types.js";

/**
 * What a contract is worth, in the currency the game is actually settled in.
 *
 * The bidder used to ask "can this hand take this many tricks" and take the
 * highest bid that passed. That is the wrong question in two directions at once.
 * It cannot see that the contract which finishes a game is worth far more than
 * the trick that reaches it, and it cannot see that going down 100 to stop them
 * scoring 500 is a good night's work. Both are invisible to a trick count and
 * obvious in points.
 *
 * So nothing here has its own idea of scoring. It plays the deal out at each
 * plausible number of tricks, hands the result to the engine's own `scoreDeal`,
 * folds it into the rubber with `applyDealScore`, and reads off how much the
 * standing moved. Game bonuses, the 500 and 700 for a rubber, doubled vulnerable
 * penalties and honors are all in there already, and none of them had to be
 * restated — which matters, because a bidder with a private copy of the scoring
 * rules would drift from the ones the deal is settled by.
 */

/**
 * How far the trick estimate is routinely wrong.
 *
 * Measured, not chosen: the calibration in `evaluate.ts` leaves a residual of
 * about 1.3 tricks, and pretending otherwise would make the bidder certain of
 * things it has no right to be. This is what turns a point count into an
 * expectation — a contract that is worth a lot when it makes and little when it
 * fails is worth bidding, and one with the reverse shape is not, and that
 * distinction exists only because the outcome is uncertain.
 */
const TRICK_SPREAD = 1.3;

/** Below-the-line points that win a game. */
const GAME_THRESHOLD = 100;

/**
 * What a game in hand is worth, over and above the points it put on the pad.
 *
 * Scoring a position by its points alone gets the most important thing in rubber
 * bridge backwards. The 500 or 700 is paid only when the rubber *finishes*, so
 * winning the first game of one adds nothing but its own trick points — and a
 * bidder reading that would see no reason to stretch for game at all, which is
 * the first thing anybody who plays this game would tell you to do.
 *
 * A game up means needing one more where they need two. Treating the games
 * beyond as near enough even money, that is about a three-in-four chance at a
 * bonus averaging six hundred, so the lead is worth roughly three hundred to
 * whoever holds it. A part-score is a fraction of a game and counted as one.
 *
 * Convenient rather than coincidental: in a one-game match the bonus *is* 300
 * and is paid on the spot, so the same constant describes both formats — the
 * part-score is worth its fraction of the bonus it is progressing toward.
 *
 * Nothing here accounts for the other half of winning a game, which is becoming
 * vulnerable. That is a real future cost and this is optimiztic by however much
 * it comes to.
 */
export const DEFAULT_GAME_EQUITY = 400;

/**
 * The standing's worth to one seat, beyond what is written on the pad.
 *
 * Zero once the match is over, because at that point the bonus has been scored
 * and counting it again would count it twice.
 */
function positionalValue(rubber: RubberState, me: PlayerId, equity: number): number {
  if (rubber.complete) {
    return 0;
  }
  const them = opponentOf(me);
  const games = rubber.gamesWon[me] - rubber.gamesWon[them];
  const part = (rubber.partScore[me] - rubber.partScore[them]) / GAME_THRESHOLD;
  return equity * (games + part);
}

/** The chance of taking each number of tricks from 0 to 13, given an estimate. */
function outcomeOdds(estimate: number): number[] {
  const weights: number[] = [];
  for (let tricks = 0; tricks <= 13; tricks++) {
    weights.push(Math.exp(-0.5 * ((tricks - estimate) / TRICK_SPREAD) ** 2));
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

/**
 * Undertricks from which a contract should expect to be doubled.
 *
 * The bot priced its own bids as though they would be left undoubled, which
 * quietly deleted the largest risk in the game. Going down two vulnerable costs
 * 100 undoubled and 500 doubled, and an opponent who can see it coming will not
 * politely decline. So the bad outcomes are priced as doubled and the rest are
 * not — which is a fair account of when a double actually arrives, because it
 * arrives exactly when somebody can see the contract failing.
 *
 * This is the difference between a bidder that treats overreaching as costing a
 * trick and one that treats it as costing a rubber.
 *
 * Two, and a judgement rather than a measurement — `bench/rubber.ts` structurally
 * cannot settle it. Every reference opponent it has either never doubles or does
 * so only from the five level, and these auctions settle at two or three, so
 * caution about being doubled measures as pure cost and a higher threshold looks
 * like free money. It is not, against anybody who actually doubles. Recording
 * real games is what would settle this.
 */
const DOUBLED_FROM_DOWN = 2;

/**
 * What a call is priced in.
 *
 * `"points"` is how the bidder has always worked: the change in the points
 * differential, plus a flat credit for the position. `"equity"` prices the same
 * call by the change in the chance of taking the rubber, which is the thing
 * actually being played for — see `equity.ts`.
 *
 * A choice rather than a replacement because a superseded release has to go on
 * playing the way it did; `release.ts` names which one each version uses, and
 * `test/botRelease.test.ts` fails if that ever stops being true. The two are not
 * on the same scale and nothing may compare a value from one against a value from
 * the other — see `disguiseValue` in `heuristicBot.ts`, which is the one place
 * that a constant has to be expressed in both.
 */
export type Objective = "equity" | "points";

export interface BidValueOptions {
  readonly contract: Contract;
  /** What a game in hand is worth. `DEFAULT_GAME_EQUITY` unless testing says otherwise. */
  readonly gameEquity: number;
  /** Tricks the *declarer* of that contract is expected to take. */
  readonly estimate: number;
  /**
   * True when this seat is offering to play the contract and the other seat
   * still has a double available. False for a contract already being defended.
   */
  readonly exposedToDouble: boolean;
  /** This seat's own hand, which is all it can count honors from. */
  readonly hand: readonly Card[];
  readonly me: PlayerId;
  /** Defaults to points, so every caller that has not been told otherwise is unchanged. */
  readonly objective?: Objective;
  /**
   * The chance of the declarer taking each number of tricks, 0 to 13.
   *
   * When supplied this replaces `outcomeOdds` entirely — a measured distribution
   * rather than a bell curve of fixed width around a counted guess. The width is
   * the point: `TRICK_SPREAD` is one number applied to every hand, so a flat hand
   * with solid honours and a wild two-suiter are treated as equally uncertain,
   * when the difference between them is most of what decides whether to stretch.
   *
   * Optional, because the search that produces it has a deadline and a hand whose
   * search is too slow still has to be bid. Absent means the old behaviour.
   */
  readonly odds?: readonly number[] | undefined;
  readonly standing: Standing;
}

/**
 * How much this seat's lead over the other would move, on one outcome.
 *
 * A difference rather than a total, because a bid is a choice between futures
 * and what matters is which one leaves you further ahead. Scoring it as points
 * gained alone would rate a sacrifice as a pure loss.
 */
function differentialAfter(options: BidValueOptions, tricks: number): number {
  const { gameEquity, hand, me, standing } = options;
  const them = opponentOf(me);
  const contract = pricedAt(options, tricks);

  const tricksWon: Pair<number> = [0, 0];
  tricksWon[contract.declarer] = tricks;
  tricksWon[opponentOf(contract.declarer)] = 13 - tricks;

  // Only this seat's honors can be counted; the other hand is unseen, and
  // guessing at it would be inventing points that may not exist.
  const hands: Pair<readonly Card[]> = [[], []];
  hands[me] = hand;

  const score = scoreDeal({ contract, hands, tricksWon }, standing.vulnerable);
  const rubber = applyDealScore(standing.rubber, score);

  if (options.objective === "equity") {
    return equityOf(rubber, me) - equityOf(standing.rubber, me);
  }

  const after = totalScore(rubber);
  const before = totalScore(standing.rubber);

  return (
    after[me] -
    after[them] +
    positionalValue(rubber, me, gameEquity) -
    (before[me] - before[them] + positionalValue(standing.rubber, me, gameEquity))
  );
}

/** The contract as it would stand on this outcome, doubled if it is heading down badly. */
function pricedAt(options: BidValueOptions, tricks: number): Contract {
  const { contract, exposedToDouble } = options;
  const undertricks = contract.level + 6 - tricks;
  const doubled =
    exposedToDouble && contract.doubling === "none" && undertricks >= DOUBLED_FROM_DOWN;
  return doubled ? { ...contract, doubling: "doubled" } : contract;
}

/** The same, averaged over every plausible number of tricks. */
export function expectedValue(options: BidValueOptions): number {
  return (options.odds ?? outcomeOdds(options.estimate)).reduce(
    (total, odds, tricks) => total + odds * differentialAfter(options, tricks),
    0,
  );
}
