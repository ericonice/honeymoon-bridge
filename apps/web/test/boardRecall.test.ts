import { applyAction, cardId, createRng, startDeal, viewFor } from "@hb/engine";
import type { Card, DealState, Pair, PlayerId } from "@hb/engine";
import { describe, expect, test } from "vitest";
import { offeredSoFar, offersFacingOpponent } from "../src/bot/boardRecall.js";
import type { BoardMemory } from "../src/bot/boardRecall.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { sampleOpponentHand } from "../src/bot/sample.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/**
 * One run of a board, played to the end of the draw, recording what each seat was
 * offered on the way.
 *
 * The recording is what the host does — the offers are read off `pending` and the top
 * of the stock before the turn consumes them, exactly as `localSession` reads them.
 */
function run(seed: number, starter: PlayerId) {
  const bots = [createHeuristicBot(createRng(seed + 1)), createHeuristicBot(createRng(seed + 2))];
  const offers: Pair<Card>[][] = [[], []];
  let state: DealState = startDeal({ seed, starter });

  while (state.phase === "draw") {
    const seat = state.toAct;
    if (state.pending !== null && state.stock[0] !== undefined) {
      offers[seat]!.push([state.pending, state.stock[0]]);
    }
    state = applyAction(
      state,
      seat,
      botActionFor({ bot: bots[seat]!, seat, standing: loveAll(), state }),
    );
  }

  return { offers, state };
}

const BOARD = 4242;
const OTHER = 99;

describe("recognising a board that comes round again", () => {
  /**
   * The whole mechanic in one assertion, and it is the pairing rather than the hand.
   *
   * Seat 0 played the board first and remembers the 26 cards it was offered. On the
   * replay the seats swap, so those pairs are what the *opponent* now faces — and the
   * consequence the sampler lives on is that exactly one card of each remembered pair
   * is in their hand. That collapses the guess from any thirteen of twenty-six to
   * thirteen coin flips.
   */
  test("the remembered pairs are exactly the pairs the opponent now faces", () => {
    const first = run(BOARD, 0);
    const memory: BoardMemory = [{ board: 0, offers: first.offers[0]! }];

    const replay = run(BOARD, 1);
    const view = viewFor(replay.state, 0);
    const found = offersFacingOpponent(memory, offeredSoFar(view, replay.state.discards[0]!));

    expect(found).not.toBeNull();
    const theirHand = new Set(replay.state.hands[1]!.map(cardId));
    for (const [one, two] of found!) {
      expect(theirHand.has(cardId(one)) !== theirHand.has(cardId(two))).toBe(true);
    }
    expect(found).toHaveLength(13);
  });

  /**
   * The discrimination, which is what makes the first test mean anything.
   *
   * A memory holding the right board *and* an unrelated one still resolves, because
   * every card this seat has been offered belongs to the other half of exactly one of
   * them. Remove the filter in `offersFacingOpponent` and two candidates survive, which
   * reads as not knowing and fails here.
   */
  test("an unrelated board in the memory does not confuse it", () => {
    const first = run(BOARD, 0);
    const unrelated = run(OTHER, 0);
    const memory: BoardMemory = [
      { board: 1, offers: unrelated.offers[0]! },
      { board: 0, offers: first.offers[0]! },
    ];

    const replay = run(BOARD, 1);
    const view = viewFor(replay.state, 0);
    const found = offersFacingOpponent(memory, offeredSoFar(view, replay.state.discards[0]!));

    expect(found).toEqual(first.offers[0]);
  });

  test("a board it has not played is not recognised", () => {
    const unrelated = run(OTHER, 0);
    const memory: BoardMemory = [{ board: 1, offers: unrelated.offers[0]! }];

    const replay = run(BOARD, 1);
    const view = viewFor(replay.state, 0);

    expect(
      offersFacingOpponent(memory, offeredSoFar(view, replay.state.discards[0]!)),
    ).toBeNull();
  });

  /**
   * Ambiguity is not a coin toss between two boards.
   *
   * Two records of the same board are both consistent with everything seen, and the
   * honest answer is that the seat cannot tell which memory applies. Guessing would be
   * worse than not knowing in only one direction — a wrong pairing makes every sampled
   * hand confidently impossible — so the count is checked rather than the first match
   * taken.
   */
  test("two consistent boards read as not knowing", () => {
    const first = run(BOARD, 0);
    const memory: BoardMemory = [
      { board: 0, offers: first.offers[0]! },
      { board: 2, offers: first.offers[0]! },
    ];

    const replay = run(BOARD, 1);
    const view = viewFor(replay.state, 0);

    expect(
      offersFacingOpponent(memory, offeredSoFar(view, replay.state.discards[0]!)),
    ).toBeNull();
  });
});

describe("what a recognised board buys the sampler", () => {
  /**
   * **What the memory buys is the pairing, and my first assertion here was wrong about
   * which fact that is.**
   *
   * I asserted that an unconstrained sample deals cards the opponent was never offered,
   * and it does not — a turn spends two stock cards and there are 26 turns, so the deck
   * is exactly exhausted and the pool this seat cannot place is *already* precisely the
   * 26 they faced. Nothing impossible was ever being dealt.
   *
   * The real gain is the structure inside those 26: they were offered them two at a time
   * and kept one of each pair, so a hand holding *both* cards of a pair is impossible and
   * a blind sampler produces them constantly. That is the whole collapse from any
   * thirteen of twenty-six — about ten million — to one from each of thirteen, 8,192.
   *
   * The second half is what stops this passing vacuously, and it is what corrected the
   * first: it asserts the blind sampler really does break pairs.
   */
  test("with the board recognised, no sampled hand holds both cards of a pair", () => {
    const first = run(BOARD, 0);
    const memory: BoardMemory = [{ board: 0, offers: first.offers[0]! }];

    const replay = run(BOARD, 1);
    const view = viewFor(replay.state, 0);
    const mine = replay.state.discards[0]!;
    const theirOffers = offersFacingOpponent(memory, offeredSoFar(view, mine));
    expect(theirOffers).not.toBeNull();

    const broken = (hand: readonly Card[]): number => {
      const held = new Set(hand.map(cardId));
      return theirOffers!.filter(([one, two]) => held.has(cardId(one)) && held.has(cardId(two)))
        .length;
    };

    const rng = createRng(7);
    for (let sample = 0; sample < 40; sample++) {
      const hand = sampleOpponentHand(view, rng, mine, theirOffers);
      expect(hand).toHaveLength(13);
      expect(broken(hand)).toBe(0);
    }

    const blind = createRng(7);
    let impossible = 0;
    for (let sample = 0; sample < 40; sample++) {
      impossible += broken(sampleOpponentHand(view, blind, mine));
    }
    expect(impossible).toBeGreaterThan(0);
  });
});
