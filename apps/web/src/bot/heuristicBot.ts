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

/**
 * Cards in a suit below which naming it is not a disguise but an outright lie.
 *
 * This used to be an upper bound: the old psych fired on anything from a void
 * up through three cards, treating "I hold none of this" and "I hold three of
 * this" as the same trick. They are not. Below three, a bid claims a suit that
 * is not there at all, and one pass closing the auction means the bot may
 * simply have to play it — that was the old mechanism (see CLAUDE.md), and it
 * cost about ten times what it earned. This is now a floor instead: nothing
 * below it is ever eligible for the credit, at any price.
 */
const DISGUISE_MIN_LENGTH = 3;

/**
 * The one length still allowed but kept rare — the shortest suit worth naming
 * at all, rather than the shortest one a lie can get away with.
 */
const DISGUISE_THIN_LENGTH = 3;

/**
 * What a thin (exactly three-card) suit's credit is scaled by, against a
 * comfortable one's full credit.
 *
 * Checked against `bench/auction.ts` rather than only reasoned about: at 0.25
 * (an effective credit of 50 off the default `DISGUISE_CREDIT_ON`) a three-card
 * suit never won at all in 400 deals — indistinguishable from off, which is too
 * conservative for what "very infrequently" was asking for. 0.5 (effective 100)
 * produced a handful in the same 400, which is the shape wanted: rare, not
 * impossible. Still a guess above that point — the credit this scales has not
 * been refitted for the floored mechanic at all.
 */
const DISGUISE_THIN_FACTOR = 0.5;

/**
 * What naming a suit that is not necessarily this hand's best one is worth, on
 * top of the contract itself.
 *
 * Not a lie any more, since the floor above means it never fires under three
 * cards — a suit named this way is always one this hand could reasonably have
 * opened. What it buys is unpredictability: a bid that always named the
 * objectively strongest suit would let the other seat read this hand's shape
 * off the auction with no room for doubt. The value is not the contract —
 * that part is still priced honestly, because one pass closes the auction and
 * the bot may simply have to play whatever it named — it is what the
 * ambiguity does to the other seat's reading of the auction, and that lives in
 * their head rather than in this deal, so it is the one thing `bidValue.ts`
 * cannot compute. Hence a single explicit credit, and setting it to zero turns
 * the whole thing off without removing the code.
 *
 * Also gated by `honestlyWeak` in `bestCall`: a flat credit is only a fair
 * price for a hand that was bidding minimally anyway. Applied unconditionally,
 * a hand worth game could be talked down to a level nobody can climb back out
 * of once the other side passes — found on a hand where the fix was that
 * flagrant, a 19-count with a six-card AKT-high suit opening 1♥.
 *
 * Zero for now. The old fitted value (200, about one lie in six) measured a
 * mechanic that could bid a void; it does not describe this one and has not
 * been refitted. See `DISGUISE_CREDIT_ON`.
 */
const DISGUISE_CREDIT = 0;

/**
 * What the credit becomes when the setting is switched on.
 *
 * Carried over from the old psych credit as a starting point, not a measured
 * answer — the floor and the thin-suit taper above change what this number
 * buys, and it has not been refitted against par or against a rubber since.
 */
export const DISGUISE_CREDIT_ON = 200;

/**
 * The dials Settings can move while their right values are still open.
 *
 * Testing only. Each of these has a fitted or reasoned default in the code, and
 * exists here because the question it answers is about a person rather than
 * about the cards — see `identity.ts`.
 */
export interface BotTuning {
  /** What naming a suit that isn't necessarily this hand's best one is worth. Zero is off. */
  readonly disguiseCredit?: number;
  /** What a game in hand is worth, in points. */
  readonly gameEquity?: number;
}

/**
 * What naming this suit at this level is worth on top of the contract, for the
 * sake of not always giving away this hand's exact shape.
 *
 * Never below `DISGUISE_MIN_LENGTH` — a suit this thin is not a real
 * alternative, it is a lie, and that is not what this buys. Rare rather than
 * forbidden at exactly three, since three is the shortest suit worth naming at
 * all but still the one likeliest to go badly if it is left to play. No-trump
 * is exempt because it says nothing about where anything lies, so there is
 * nothing to be ambiguous about.
 */
function disguiseValue(view: PlayerView, level: number, strain: Strain, credit: number): number {
  if (credit === 0 || level !== 1 || strain === "NT") {
    return 0;
  }
  const length = cardsIn(view.hand, strain).length;
  if (length < DISGUISE_MIN_LENGTH) {
    return 0;
  }
  return length === DISGUISE_THIN_LENGTH ? credit * DISGUISE_THIN_FACTOR : credit;
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
  disguiseCredit: number,
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
          }) + disguiseValue(view, call.bid.level, call.bid.strain, disguiseCredit),
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
 * Whether this hand's own honest bidding, before any disguise credit, would
 * stop at the cheapest level anyway.
 *
 * The credit is a free alternative only for a hand that was bidding minimally
 * regardless — which suit gets named is a wash then, since the level was
 * never in question. A hand that honestly wants to jump has already answered
 * that question, and a flat credit is not entitled to talk it back down: one
 * pass closes the auction, and a hand worth game disguised into a level
 * nobody can climb back out of is exactly the failure this guards against.
 */
function honestlyWeak(view: PlayerView, standing: Standing, gameEquity: number): boolean {
  const honest = bidCandidates(view, standing, 0, gameEquity).reduce<Candidate | null>(
    (top, candidate) => (top === null || candidate.value > top.value ? candidate : top),
    null,
  );
  return honest === null || (honest.call.type === "bid" && honest.call.bid.level === 1);
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
  disguiseCredit: number,
  gameEquity: number,
): Call {
  const passing = valueOfPassing(view, standing, gameEquity);
  const effectiveDisguiseCredit =
    disguiseCredit !== 0 && honestlyWeak(view, standing, gameEquity) ? disguiseCredit : 0;
  const best = [
    ...bidCandidates(view, standing, effectiveDisguiseCredit, gameEquity),
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
  const disguiseCredit = tuning.disguiseCredit ?? DISGUISE_CREDIT;
  const gameEquity = tuning.gameEquity ?? DEFAULT_GAME_EQUITY;

  return {
    // Shown to the player wherever the other seat is named, so it reads as an
    // opponent rather than as an implementation.
    name: "Computer",

    chooseCall(view: PlayerView, standing: Standing): Call {
      return bestCall(view, standing, disguiseCredit, gameEquity);
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
