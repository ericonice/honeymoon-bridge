import { currentDoubling, lastBidEntry, legalActionsForView } from "@hb/engine";
import type { Bid, Call, Card, Contract, DrawTake, PlayerView, Rng, Strain } from "@hb/engine";
import { DEFAULT_GAME_EQUITY, expectedValue } from "./bidValue.js";
import { chooseCard } from "./cardPlay.js";
import { chooseTake } from "./drawDecision.js";
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
 * The same trust, applied to the contract this seat is proposing for itself.
 *
 * Separate from `THEIR_BID_WEIGHT` because the inference is a step longer and so
 * a step weaker: their claim is about *their* strain, and reaching this hand's
 * proposed strain from it goes through this hand's own read of the difference
 * between the two. Same evidence, more of it guessed.
 *
 * That this was zero for so long is the whole of a bug worth remembering. The
 * bidder blended their claim into the value of *their* contract and threw it away
 * when pricing its own, so on a hand where they had bid 4♥ it simultaneously
 * believed they took ten tricks and that it took eight and a half — and bid on
 * the flattering half of a contradiction. Recorded games showed eight doubled
 * disasters carrying 78% of a 205-point-a-deal deficit, and every one of them was
 * this: 4NT over 4♥ holding ♥87, priced as down two, actually down eight.
 *
 * The pricing was never wrong. `bidValue.ts` correctly rated a contract it
 * expected to fail by two as a cheap sacrifice against conceding a game. It was
 * handed an estimate six tricks too high.
 *
 * **Low rather than symmetric, and that was the measurement's decision rather
 * than a guess.** At 0.75 all eight recorded disasters go away and the bot loses
 * 200 points a rubber; `bench/rubber.ts`'s `vs=` mode, which plays this bidder
 * against itself at a different weight, says the loss is real and not the legacy
 * reference overclaiming — −47 at 0.25, −248 at 0.5, −354 at 0.75. See
 * `impliedByTheirBid` for why the inference is weaker than it looks. What actually
 * fixed the disasters was `RACE_COST` in `evaluate.ts`, upstream of all of this;
 * 0.25 is what is left over once the estimate itself is no longer lying, and it
 * buys one more of the eight for no measurable cost.
 */
const THEIR_BID_ON_OWN_WEIGHT = 0.25;

/**
 * The level below which their bid is a floor rather than an estimate, and so says
 * nothing about what is left for this hand.
 *
 * Nobody bids 4♥ for fun, so a four-level bid is close to a real claim about ten
 * tricks. A one-level bid is not a claim about seven — it is whatever was cheap
 * enough to be worth saying, and a hand worth nine tricks opens 1♥ just as
 * readily as a hand worth seven. Reading it as a point estimate is what made the
 * inference cost 200 points a rubber before this gate existed: it dragged the
 * bot's own estimate down after every minimum opening the other seat made, and
 * turned a bidder that competed into one that folded.
 *
 * Three because that is where the recorded disasters started. Every one of the
 * eight was a bid over a three-, four- or six-level contract; none followed a
 * one- or two-level bid.
 */
const THEIR_BID_MIN_LEVEL = 3;

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
 * The dials that can be moved while their right values are still open.
 *
 * Testing only. Each of these has a fitted or reasoned default in the code. The
 * first two are here because the question they answer is about a person rather
 * than about the cards, and Settings exposes them — see `identity.ts`. The third
 * is not a Settings dial and never should be: it is here so a bench can play one
 * value against another in the same run, which is the only way to ask whether
 * trusting the other seat's bid helps against a bidder that is not the legacy
 * reference. Fitting it against a reference that overclaims answers a different
 * question, and answers it wrongly.
 */
export interface BotTuning {
  /** What naming a suit that isn't necessarily this hand's best one is worth. Zero is off. */
  readonly disguiseCredit?: number;
  /** What a game in hand is worth, in points. */
  readonly gameEquity?: number;
  /** How far to trust their bid when pricing this seat's own contract. */
  readonly theirBidOnOwnWeight?: number;
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

/** This hand's own read of a strain, discounted in any strain they have named. */
function ownEstimate(view: PlayerView, strain: Strain): number {
  return estimatedTricks(view.hand, strain, strainsTheyBid(view).has(strain));
}

/**
 * The highest bid the opponent has made, which is their strongest claim.
 *
 * The highest rather than the latest, because that is the one that says the most
 * about their hand; where they are the same bid, as they usually are, it makes no
 * difference.
 */
function theirHighestBid(view: PlayerView): Bid | null {
  let best: Bid | null = null;
  for (const entry of view.auction) {
    if (entry.by === view.opponent && entry.call.type === "bid") {
      if (best === null || entry.call.bid.level > best.level) {
        best = entry.call.bid;
      }
    }
  }
  return best;
}

/**
 * How many tricks this hand has left in a strain of its own, taken from the level
 * they chose rather than from its own thirteen cards.
 *
 * There are thirteen tricks. If their bid claims nine of them in hearts, this
 * hand holds four in hearts — that part is arithmetic rather than evaluation, and
 * it is the strongest single piece of evidence in the auction, because it is the
 * only one chosen by somebody who could see the cards it describes.
 *
 * Reaching a *different* strain from there needs one step of this hand's own
 * judgement: whatever it thinks no-trump is worth over hearts, it adds to what
 * their bid left it in hearts. **That step is the weak link, and measurement says
 * so.** Trick counts are not additive across strains — the same two hands can be
 * worth eleven tricks in hearts to one seat and ten in clubs to the other — so
 * the thirteen-trick arithmetic above is sound only inside the strain they named,
 * and everything this function does to leave that strain is an approximation.
 * Which is why `THEIR_BID_ON_OWN_WEIGHT` ships low: played against a bidder as
 * honest as this one, trusting the whole inference costs 354 points a rubber.
 *
 * Null when they have not bid or bid only cheaply, since a bid below
 * `THEIR_BID_MIN_LEVEL` is a floor rather than a claim and there is nothing to
 * infer from it.
 */
function impliedByTheirBid(view: PlayerView, strain: Strain): number | null {
  const claim = theirHighestBid(view);
  if (claim === null || claim.level < THEIR_BID_MIN_LEVEL) {
    return null;
  }
  const mineInTheirs = ownEstimate(view, claim.strain);
  return TRICKS - (claim.level + BOOK) + (ownEstimate(view, strain) - mineInTheirs);
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
function estimateFor(contract: Contract, { theirBidOnOwnWeight, view }: CallContext): number {
  if (contract.declarer === view.me) {
    const own = ownEstimate(view, contract.strain);
    const implied = impliedByTheirBid(view, contract.strain);
    return implied === null
      ? own
      : (1 - theirBidOnOwnWeight) * own + theirBidOnOwnWeight * implied;
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
 * Everything a call is decided from, in one shape.
 *
 * These used to be four positional parameters threaded through five functions,
 * which is how the estimate came to be computed two different ways in two of
 * them — a fifth was the point at which that stopped being tolerable.
 */
interface CallContext {
  readonly disguiseCredit: number;
  readonly gameEquity: number;
  readonly standing: Standing;
  readonly theirBidOnOwnWeight: number;
  readonly view: PlayerView;
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
function valueOfPassing(context: CallContext): number {
  const { gameEquity, standing, view } = context;
  const contract = standingContract(view);
  if (contract === null) {
    return 0;
  }
  return expectedValue({
    contract,
    estimate: estimateFor(contract, context),
    exposedToDouble: false,
    gameEquity,
    hand: view.hand,
    me: view.me,
    standing,
  });
}

/**
 * Note that the estimate comes from `estimateFor` rather than from
 * `estimatedTricks` directly. It used to call the latter, which is how this and
 * the price of passing came to read the auction differently — one function
 * answering "how many tricks does the declarer of this contract take" is what
 * keeps the two halves of a competitive decision consistent with each other.
 */
function bidCandidates(context: CallContext, disguiseCredit: number): Candidate[] {
  const { gameEquity, standing, view } = context;
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
            estimate: estimateFor(contract, context),
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
function doubleCandidate(context: CallContext): Candidate[] {
  const { gameEquity, standing, view } = context;
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
        estimate: estimateFor(doubled, context),
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
function honestlyWeak(context: CallContext): boolean {
  const honest = bidCandidates(context, 0).reduce<Candidate | null>(
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
function bestCall(context: CallContext): Call {
  const { disguiseCredit, view } = context;
  const passing = valueOfPassing(context);
  const effectiveDisguiseCredit =
    disguiseCredit !== 0 && honestlyWeak(context) ? disguiseCredit : 0;
  const best = [
    ...bidCandidates(context, effectiveDisguiseCredit),
    ...doubleCandidate(context),
  ].reduce<Candidate | null>(
    (top, candidate) => (top === null || candidate.value > top.value ? candidate : top),
    null,
  );

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
  const theirBidOnOwnWeight = tuning.theirBidOnOwnWeight ?? THEIR_BID_ON_OWN_WEIGHT;

  return {
    // Shown to the player wherever the other seat is named, so it reads as an
    // opponent rather than as an implementation.
    name: "Computer",

    chooseCall(view: PlayerView, standing: Standing): Call {
      return bestCall({ disguiseCredit, gameEquity, standing, theirBidOnOwnWeight, view });
    },

    chooseDraw(view: PlayerView, remembered: readonly Card[]): DrawTake {
      return view.pending === null
        ? fallback.chooseDraw(view, remembered)
        : chooseTake({
            discardTop: view.discardTop,
            first: view.pending,
            hand: view.hand,
            remembered,
          });
    },

    choosePlay(view: PlayerView, remembered: readonly Card[]): Card {
      return view.contract === null ? fallback.choosePlay(view, remembered) : chooseCard(view);
    },
  };
}
