import { buildDeck, cardId, sameCard, shuffle } from "@hb/engine";
import type { Card, Pair, PlayerId, PlayerView, Rng, Suit } from "@hb/engine";
import { canSimulate, simulateDraw, theirChoices } from "./drawSimulation.js";

/**
 * A guess at the opponent's hand, consistent with everything this seat has seen.
 *
 * The solver needs two hands and a seat only ever has one, so this supplies the
 * other. Half the deck is out of play, which makes the guess much weaker than
 * the equivalent in ordinary bridge — there, every unseen card is in somebody's
 * hand and the deal is fully determined once you guess. Here roughly a third of
 * what could be theirs actually is, and the rest was never dealt. That is
 * precisely why one guess is worthless and an average over many is not.
 *
 * Only one constraint is available without memory: a suit they failed to follow
 * is a suit they hold none of. The pool would shrink further by whatever the bot
 * remembers discarding — that belongs here, as a smaller pool, and nowhere else.
 */

/** Suits the opponent has proved void in by discarding on a lead of that suit. */
export function shownVoids(view: PlayerView): Set<Suit> {
  const voids = new Set<Suit>();

  for (const trick of [...view.completedTricks.map((one) => one.cards), view.currentTrick]) {
    const led = trick[0];
    if (led === undefined) {
      continue;
    }
    for (const played of trick) {
      if (played.by === view.opponent && played.card.suit !== led.card.suit) {
        voids.add(led.card.suit);
      }
    }
  }

  return voids;
}

/**
 * Every card this seat cannot place: not in its hand, not yet played, and not
 * one it threw away itself.
 *
 * That last group is the one worth spelling out. Thirteen cards go face down
 * from this seat's own hand during the draw, and it looked at every one of them.
 * Leaving them in the pool lets the sampler deal the opponent cards it watched
 * itself discard — not a subtle bias but an impossible hand, and by the end of
 * the deal half of what is unaccounted for is exactly those thirteen.
 */
function unaccounted(view: PlayerView, remembered: readonly Card[]): Card[] {
  const placed = new Set([
    ...view.hand.map(cardId),
    ...remembered.map(cardId),
    ...view.completedTricks.flatMap((trick) => trick.cards.map((played) => cardId(played.card))),
    ...view.currentTrick.map((played) => cardId(played.card)),
  ]);
  return buildDeck().filter((card) => !placed.has(cardId(card)));
}

/**
 * How much likelier a card is to be theirs in a suit they bid.
 *
 * The auction is evidence about the hand this seat cannot see, and until now the
 * only evidence being used was the cards already played. That skipped the
 * strongest thing in the deal: with no partner and no conventions, a bid means
 * they are long in that suit and means nothing else.
 *
 * Two rather than a computed share, because the sample only has to lean the
 * right way. Every guess is wrong in detail; what matters is that the guesses
 * are wrong in the same direction the real hand is.
 *
 * Worth 15% of everything the bot throws away — tricks lost against par fall
 * from 1.23 a deal to 1.05, improving declarer and defense by almost exactly the
 * same amount. Measured in *points* the same change reads as slightly harmful
 * (+47.8 against +50.1 a deal), and it is not: points per deal cannot resolve
 * an effect this size at any sample count worth waiting for. Measure card play
 * against par, always.
 */
const BID_WEIGHT = 2;

/**
 * How much likelier an honour is to be a card they kept than one they threw.
 *
 * **The unknown cards are not exchangeable, and treating them as though they were
 * is worth more than a trick.** Twenty-six cards are dead in this game — their
 * discards and the undrawn stock — so the pool this samples from holds thirteen
 * they *kept* and roughly thirteen they *threw away*, and they were choosing. A
 * uniform draw hands them an average thirteen of the twenty-six when they are
 * holding their best.
 *
 * Measured over 300 deals: they actually hold **15.4** high-card points, a uniform
 * sample guesses **9.9**, and what they discarded averages **4.5**. Nine-nine is
 * almost exactly half of the twenty points they saw, which is what a coin flip per
 * card produces. The consequence is a searched trick estimate biased **+1.14
 * tricks** — the bot expecting to take more than it will, because it is imagining
 * a weaker opponent than the one it has.
 *
 * Weighted by rank rather than by a keep-or-throw model, because rank is what a
 * draw decision mostly turns on and a weight is one number to fit. Aces and kings
 * are near-certainly kept; a two is near-certainly gone.
 */
const KEEP_SHAPE: Readonly<Record<number, number>> = {
  14: 6,
  13: 5,
  12: 4,
  11: 3,
  10: 2.2,
  9: 1.6,
  8: 1.2,
};

/**
 * How hard to lean on the shape above. One knob, fitted to one observable.
 *
 * The shape says which ranks are likelier kept; this says how much to believe it,
 * and it is fitted against the only thing here that can be checked directly — the
 * high-card points the sampler produces against the points the opponent really
 * holds. At 0 the sample is uniform and comes out at 9.9 against a true 15.4; at 1
 * it overshoots to 16.6; 0.55 gives 15.1 and 0.65 gives 15.6. Fitted to land on
 * the truth rather than reasoned about, the same way `evaluate.ts`'s calibration
 * is.
 */
const KEEP_STRENGTH = 0.6;

/**
 * How likely this card is to be one they kept rather than one they threw.
 *
 * Ranks below eight fall through to 1, which is the floor rather than zero: a low
 * card in a suit they were building is kept all the time, and a sampler that could
 * not deal them one would produce hands with no shape at all.
 */
function keepWeight(card: Card): number {
  return 1 + KEEP_STRENGTH * ((KEEP_SHAPE[card.rank] ?? 1) - 1);
}

/** Strains the opponent has named, which are the suits to expect length in. */
function suitsTheyBid(view: PlayerView): Set<Suit> {
  const named = new Set<Suit>();
  for (const entry of view.auction) {
    if (entry.by === view.opponent && entry.call.type === "bid" && entry.call.bid.strain !== "NT") {
      named.add(entry.call.bid.strain);
    }
  }
  return named;
}

/**
 * A weighted draw without replacement, off the seeded generator.
 *
 * Each card races on a key of `-log(u) / weight`, and the lowest keys win, which
 * draws each card in proportion to its weight exactly. Shuffling and taking the
 * first n is the same thing with every weight equal, and this keeps that
 * property when they are not.
 */
function drawWeighted(cards: readonly Card[], size: number, weight: (card: Card) => number, rng: Rng): Card[] {
  return cards
    .map((card) => ({ card, key: -Math.log(1 - rng.next()) / weight(card) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, size)
    .map((entry) => entry.card);
}

export function sampleOpponentHand(
  view: PlayerView,
  rng: Rng,
  remembered: readonly Card[] = [],
  theirOffers: readonly Pair<Card>[] | null = null,
): Card[] {
  const size = view.handSizes[view.opponent];
  const pool = unaccounted(view, remembered);
  const voids = shownVoids(view);
  const possible = pool.filter((card) => !voids.has(card.suit));

  // **A remembered board collapses the guess from a combination to thirteen coin
  // flips.** Without it the opponent's hand is any thirteen of twenty-six, which is
  // C(26,13) — about ten million. Knowing the *pairs* they were offered, which this
  // seat knows because it faced exactly those pairs on the board's other run, makes
  // it one card from each of thirteen pairs: 8,192. Every sampled hand is then a hand
  // they could actually be holding, rather than one the arithmetic allows.
  //
  // The pairs are known rather than guessed because the offers are fixed by the seed
  // (`REQUIREMENTS.md` §1.8) — so this is recall, not inference, and it is exactly as
  // strong as the memory handed over.
  const fromMemory =
    theirOffers === null
      ? null
      : sampleFromOffers({ played: playedBy(view, view.opponent), rng, size, theirOffers });
  if (fromMemory !== null) {
    return fromMemory;
  }

  // The voids cannot make the pool too small to fill a hand — the cards they
  // are void in are precisely the ones they no longer hold — but a hand that
  // could not be dealt would be worse than an unconstrained guess.
  const drawable = possible.length >= size ? possible : pool;

  // Replaying the draw beats weighting for it, where the draw can be replayed:
  // it selects the hand by the same amount their own recorded choices did, rather
  // than by an average fitted across every deal. See `drawSimulation.ts`.
  const choices = theirChoices(view);
  if (canSimulate(drawable, size, choices)) {
    return simulateDraw({ pool: drawable, rng, turns: choices });
  }

  const bid = suitsTheyBid(view);
  return drawWeighted(
    drawable,
    size,
    (card) => keepWeight(card) * (bid.has(card.suit) ? BID_WEIGHT : 1),
    rng,
  );
}

/**
 * A hand built by choosing one card from each remembered pair.
 *
 * Weighted by which card a sensible player takes, using the same `keepTest` the draw
 * itself uses — so a remembered board produces hands selected the way a real hand was
 * selected, rather than uniformly from the pairs.
 *
 * Returns null rather than a wrong answer when the memory cannot account for what is
 * already on the table: a card the opponent has played must be in the hand, and if the
 * remembered pairs cannot produce it then the memory does not describe this deal and
 * the caller should fall back. That is a real case rather than defensive coding —
 * partial recall is a difficulty lever, and a half-remembered board must degrade to a
 * guess instead of to a lie.
 */
function sampleFromOffers(options: {
  readonly played: readonly Card[];
  readonly rng: Rng;
  readonly size: number;
  readonly theirOffers: readonly Pair<Card>[];
}): Card[] | null {
  const { played, rng, size, theirOffers } = options;
  const needed = new Set(played.map(cardId));
  const hand: Card[] = [];

  for (const [first, second] of theirOffers) {
    // A card they have already played settles its own pair outright.
    const forced = needed.has(cardId(first)) ? first : needed.has(cardId(second)) ? second : null;
    if (forced !== null) {
      hand.push(forced);
      continue;
    }
    hand.push(rng.next() < keepShare(first, second) ? first : second);
  }

  if (hand.length !== size + played.length && hand.length !== size) {
    return null;
  }
  // Every card they have shown has to be in there, or these pairs are not this deal's.
  if (!played.every((card) => hand.some((held) => sameCard(held, card)))) {
    return null;
  }
  // Trimmed to the hand they hold *now*: the cards already played are gone from it.
  const remaining = hand.filter((card) => !needed.has(cardId(card)));
  return remaining.length === size ? remaining : null;
}

/**
 * How likely the first of a pair is the one kept, by how much better it is.
 *
 * The draw's own valuation would need the hand as it stood at that turn, which is not
 * recoverable; this asks the cheaper question — which card is worth more on its own —
 * and leaves it a weighting rather than a certainty, because the opponent chose with
 * a hand this does not have.
 */
function keepShare(first: Card, second: Card): number {
  const one = keepWeight(first);
  const two = keepWeight(second);
  return one + two === 0 ? 0.5 : one / (one + two);
}

/** Cards this seat has watched the named player put on the table. */
function playedBy(view: PlayerView, player: PlayerId): Card[] {
  const played: Card[] = [];
  for (const trick of view.completedTricks) {
    for (const card of trick.cards) {
      if (card.by === player) {
        played.push(card.card);
      }
    }
  }
  for (const card of view.currentTrick) {
    if (card.by === player) {
      played.push(card.card);
    }
  }
  return played;
}
