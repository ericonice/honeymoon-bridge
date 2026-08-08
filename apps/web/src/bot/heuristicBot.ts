import { currentDoubling, lastBidEntry, legalActionsForView } from "@hb/engine";
import type { Call, Card, Contract, PlayerView, Rng, Strain } from "@hb/engine";
import { DEFAULT_GAME_EQUITY, expectedValue } from "./bidValue.js";
import { chooseCard } from "./cardPlay.js";
import { shouldKeepCard } from "./drawDecision.js";
import { cardsIn, defendingTricks, estimatedTricks } from "./evaluate.js";
import { createRandomBot } from "./randomBot.js";
import type { Bot, Standing } from "./types.js";

const TRICKS = 13;
const BOOK = 6;

/**
 * How far to trust what their bid claims, against what this hand can see.
 *
 * Fitted over rubbers, and the answer was a surprise: 0.75, on a broad plateau
 * from about 0.6 to 0.9. Their bid is much better evidence than the hand this
 * seat is holding — which makes sense once said aloud, since it is the only
 * thing in the deal that was chosen by somebody who could see the cards in
 * question.
 *
 * Worth knowing that trusting it *completely* is no longer a disaster: at 1.0
 * the margin only falls back to where 0.6 sits. Taking the bid as fact was what
 * drove both bots to doubled contracts at the five level earlier, but that was a
 * combination — a trick of optimism in the estimate and no price on being
 * doubled — and not this evidence on its own. Two bad numbers made a spiral;
 * neither did it alone.
 */
const THEIR_BID_WEIGHT = 0.75;

/** Cards in a suit past which naming it is no longer a lie. */
const PSYCH_MAX_LENGTH = 3;

/**
 * What the deception in a psych is worth, on top of the contract itself.
 *
 * A psych is a bid in a suit the hand does not hold, made to be believed. Its
 * value is not the contract — that part is priced honestly, and has to be,
 * because one pass closes the auction and every psych is a contract the bot may
 * simply have to play. Its value is what the lie does to the other seat, and
 * that lives in their head rather than in this deal, so it is the one thing
 * `bidValue.ts` cannot compute.
 *
 * Hence a single explicit credit, fitted. Setting it to zero turns psyching off
 * without removing the code, because a short suit never outbids an honest one on
 * the contract alone. **The frequency is an outcome, not a setting** — how often
 * the bot lies is whatever this credit makes worthwhile, which is the right way
 * round: it psychs when a hand offers the chance rather than on a timer.
 *
 * Zero, and this time properly measured rather than assumed. The scale is not
 * obvious from the number: 50 produces no psychs at all, 100 produces two in
 * four hundred deals, and 200 produces one in every six — so an early sweep at
 * 100 compared a bot that never lies against one that lied twice, and returned
 * an identical win-loss count that looked like a clean null.
 *
 * At 200, against a sampler that does read the auction and can therefore be
 * fooled, **the deception works and does not come close to paying for itself.**
 * The other seat throws away 0.02 more tricks a deal in both roles, consistently,
 * so the lie is landing. Meanwhile contracts that were makeable at par fall from
 * 53% to 49%, because one pass closes the auction and a suit you do not hold is
 * sometimes a suit you are left playing. The gain is an order of magnitude under
 * the cost.
 *
 * What this does *not* settle is whether psyching pays against a person. A human
 * forms a much stronger belief from an auction than a weighted sampler does, and
 * holds it for longer. That is unmeasurable here, and the same category as
 * `DOUBLED_FROM_DOWN` — behavior aimed at a human that only a human can judge.
 */
const PSYCH_CREDIT = 0;

/** What the credit becomes when psyching is switched on: about one lie in six. */
export const PSYCH_CREDIT_ON = 200;

/**
 * The dials Settings can move while their right values are still open.
 *
 * Testing only. Each of these has a fitted or reasoned default in the code, and
 * exists here because the question it answers is about a person rather than
 * about the cards — see `identity.ts`.
 */
export interface BotTuning {
  /** What a game in hand is worth, in points. */
  readonly gameEquity?: number;
  /** What the deception in a psych is worth. Zero is off. */
  readonly psychCredit?: number;
}

/**
 * A bid this hand cannot back up.
 *
 * Cheap, in a suit it is short in, and a suit rather than no-trump — naming
 * no-trump says nothing about where anything lies, so there is nothing to
 * mislead anybody about.
 */
function isPsych(view: PlayerView, level: number, strain: Strain): boolean {
  return (
    level === 1 && strain !== "NT" && cardsIn(view.hand, strain).length <= PSYCH_MAX_LENGTH
  );
}

/**
 * Strains the opponent has named.
 *
 * The whole of what a two-player auction gives you. There is no partner to be
 * signalling to and no conventions to decode, so a bid is evidence of one thing
 * only — length — and it is evidence against this hand's own worth in that
 * strain. Threaded into `estimatedTricks`, which is where the model keeps its
 * assumption about how much of a suit the other hand holds.
 */
function strainsTheyBid(view: PlayerView): Set<Strain> {
  const named = new Set<Strain>();
  for (const entry of view.auction) {
    if (entry.by === view.opponent && entry.call.type === "bid") {
      named.add(entry.call.bid.strain);
    }
  }
  return named;
}

function callsFor(view: PlayerView): Call[] {
  return legalActionsForView(view).flatMap((action) =>
    action.type === "call" ? [action.call] : [],
  );
}

/**
 * The contract the auction stands at, or null before anybody has bid.
 *
 * Declarer is whoever made the last bid, which in this game is the whole of the
 * rule — and it may well be this seat, since a double leaves the bot on turn
 * over its own contract.
 */
function standingContract(view: PlayerView): Contract | null {
  const entry = lastBidEntry(view.auction);
  if (entry === null || entry.call.type !== "bid") {
    return null;
  }
  return {
    declarer: entry.by,
    doubling: currentDoubling(view.auction),
    level: entry.call.bid.level,
    strain: entry.call.bid.strain,
  };
}

/**
 * Tricks the declarer of a contract is expected to take.
 *
 * When that is this seat, its own evaluation answers, discounted in any strain
 * they have named — their length is evidence against this hand's worth in it.
 *
 * When it is the opponent, two independent things are known and neither is their
 * hand. This seat's own cards say how many tricks it will take away from them.
 * The level they chose says how many they believe they hold. Both are evidence,
 * and the weighting between them was measured rather than assumed.
 */
function estimateFor(contract: Contract, view: PlayerView): number {
  if (contract.declarer === view.me) {
    return estimatedTricks(view.hand, contract.strain, strainsTheyBid(view).has(contract.strain));
  }

  // Two pieces of evidence about a hand this seat cannot see, and they are
  // independent. Its own cards say how many tricks it will take away from them;
  // the level they chose says how many they think they have. Weighted rather
  // than swapped: taking the bid alone is what made defending look hopeless and
  // pushed both bots to the seven level, so their claim is treated as evidence
  // and not as fact.
  const fromMyHand = TRICKS - defendingTricks(view.hand, contract.strain);
  const fromTheirBid = contract.level + BOOK;
  return (1 - THEIR_BID_WEIGHT) * fromMyHand + THEIR_BID_WEIGHT * fromTheirBid;
}

interface Candidate {
  readonly call: Call;
  readonly value: number;
}

/**
 * What passing is worth: whatever the auction already stands at, played out.
 *
 * Zero when nothing has been bid, because passing then costs and gains nothing
 * — the deal is thrown in and redealt. Everywhere else this is the number a bid
 * has to beat, and it is what makes sacrificing expressible at all: letting them
 * play a vulnerable game is not a neutral outcome to be compared against zero,
 * it is a large negative, and a contract that goes down cheaply can beat it.
 */
function valueOfPassing(
  view: PlayerView,
  standing: Standing,
  gameEquity: number,
): number {
  const contract = standingContract(view);
  if (contract === null) {
    return 0;
  }
  return expectedValue({
    contract,
    estimate: estimateFor(contract, view),
    exposedToDouble: false,
    gameEquity,
    hand: view.hand,
    me: view.me,
    standing,
  });
}

function bidCandidates(
  view: PlayerView,
  standing: Standing,
  psychCredit: number,
  gameEquity: number,
): Candidate[] {
  const theirs = strainsTheyBid(view);

  return callsFor(view).flatMap((call) => {
    if (call.type !== "bid") {
      return [];
    }
    const contract: Contract = {
      declarer: view.me,
      doubling: "none",
      level: call.bid.level,
      strain: call.bid.strain,
    };
    return [
      {
        call,
        value:
          expectedValue({
            contract,
            estimate: estimatedTricks(view.hand, call.bid.strain, theirs.has(call.bid.strain)),
            exposedToDouble: true,
            gameEquity,
            hand: view.hand,
            me: view.me,
            standing,
          }) + (isPsych(view, call.bid.level, call.bid.strain) ? psychCredit : 0),
      },
    ];
  });
}

/**
 * Doubling, priced the same way as everything else.
 *
 * This used to be a pair of hand-picked thresholds — level five or higher, three
 * defensive tricks — because there was no way to say how badly they would do.
 * There is now: the same defense estimate that prices passing prices this, and a
 * double is simply the same contract worth more in both directions. It stops
 * being a special case at the moment the bot can estimate what it beats them by.
 */
function doubleCandidate(
  view: PlayerView,
  standing: Standing,
  gameEquity: number,
): Candidate[] {
  const contract = standingContract(view);
  if (contract === null || !callsFor(view).some((call) => call.type === "double")) {
    return [];
  }
  const doubled: Contract = { ...contract, doubling: "doubled" };
  return [
    {
      call: { type: "double" },
      value: expectedValue({
        contract: doubled,
        estimate: estimateFor(doubled, view),
        exposedToDouble: false,
        gameEquity,
        hand: view.hand,
        me: view.me,
        standing,
      }),
    },
  ];
}

/**
 * Bids what the deal is worth at this score, rather than what the hand can make.
 *
 * Every legal bid is priced in points and compared against the price of passing,
 * and the best of them is taken only if it beats passing. Three things that had
 * to be reasoned about separately fall out of that one comparison: a contract
 * that finishes a game outbids a safer one below it, a cheap contract that goes
 * down beats letting them score a game, and there is no reason to jump to the
 * top of what the hand can make when the extra level costs more than it returns.
 */
function bestCall(
  view: PlayerView,
  standing: Standing,
  psychCredit: number,
  gameEquity: number,
): Call {
  const passing = valueOfPassing(view, standing, gameEquity);
  const best = [
    ...bidCandidates(view, standing, psychCredit, gameEquity),
    ...doubleCandidate(view, standing, gameEquity),
  ].reduce<
    Candidate | null
  >((top, candidate) => (top === null || candidate.value > top.value ? candidate : top), null);

  if (best !== null && best.value > passing) {
    return best.call;
  }

  const calls = callsFor(view);
  return calls.some((call) => call.type === "pass") ? { type: "pass" } : calls[0]!;
}

/**
 * Bids from what the deal is worth, draws from what a card adds, and plays by
 * rule. Card play is replaced wholesale by `createSamplingBot`, which delegates
 * the other two decisions back here.
 */
export function createHeuristicBot(rng: Rng, tuning: BotTuning = {}): Bot {
  const fallback = createRandomBot(rng);
  const psychCredit = tuning.psychCredit ?? PSYCH_CREDIT;
  const gameEquity = tuning.gameEquity ?? DEFAULT_GAME_EQUITY;

  return {
    // Shown to the player wherever the other seat is named, so it reads as an
    // opponent rather than as an implementation.
    name: "Computer",

    chooseCall(view: PlayerView, standing: Standing): Call {
      return bestCall(view, standing, psychCredit, gameEquity);
    },

    chooseDraw(view: PlayerView, remembered: readonly Card[]): boolean {
      return view.pending === null
        ? fallback.chooseDraw(view, remembered)
        : shouldKeepCard(view.hand, view.pending, remembered);
    },

    choosePlay(view: PlayerView, remembered: readonly Card[]): Card {
      return view.contract === null ? fallback.choosePlay(view, remembered) : chooseCard(view);
    },
  };
}
