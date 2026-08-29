import { applyAction, createRng, startDeal, viewFor } from "@hb/engine";
import type { Card, Contract, DealState, Pair, PlayerId, PlayerView } from "@hb/engine";
import { describe, expect, test } from "vitest";
import { boardFacing, offeredSoFar } from "../src/bot/boardRecall.js";
import type { BoardMemory, BoardOutcome } from "../src/bot/boardRecall.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { impliedByLastTime } from "../src/bot/heuristicBot.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

const HEARTS: Contract = { declarer: 0, doubling: "none", level: 2, strain: "H" };

function outcome(over: Partial<BoardOutcome> = {}): BoardOutcome {
  return { contract: HEARTS, declared: false, tricksWon: [3, 10], ...over };
}

/** A view is only read for `me`, so this is the whole of what the rule needs. */
const seat0 = { me: 0 } as unknown as PlayerView;

function bidding(strain: "H" | "S", declarer: PlayerId): Contract {
  return { declarer, doubling: "none", level: 2, strain };
}

describe("what a board's first run says about this one", () => {
  /**
   * The crossing, which is the whole of the rule. A replay hands each seat the other
   * stream, so the cards this seat now holds are the ones the opponent held last time.
   * Evidence about this hand is therefore what *they* did, and evidence about theirs is
   * what this seat did.
   */
  test("their contract last time is evidence about this seat's hand now", () => {
    const played = outcome({ declared: false, tricksWon: [3, 10] });
    expect(impliedByLastTime(bidding("H", 0), { played, view: seat0 })).toBe(10);
  });

  test("this seat's contract last time is evidence about their hand now", () => {
    const played = outcome({ declared: true, tricksWon: [10, 3] });
    expect(impliedByLastTime(bidding("H", 1), { played, view: seat0 })).toBe(10);
  });

  /**
   * The two combinations that say nothing, and they are dropped rather than rotated.
   * Double-dummy tricks depend on who leads, so the same stock declaring from the other
   * side is a different position whose split nothing here knows.
   */
  test("the same side declaring twice transfers nothing", () => {
    const theirs = outcome({ declared: false, tricksWon: [3, 10] });
    expect(impliedByLastTime(bidding("H", 1), { played: theirs, view: seat0 })).toBeNull();
    const mine = outcome({ declared: true, tricksWon: [10, 3] });
    expect(impliedByLastTime(bidding("H", 0), { played: mine, view: seat0 })).toBeNull();
  });

  /**
   * Trick counts are not additive across strains — a hand pair can be eleven in hearts
   * and ten in clubs — so carrying a count from one strain to another is guesswork.
   */
  test("a different strain transfers nothing", () => {
    expect(impliedByLastTime(bidding("S", 0), { played: outcome(), view: seat0 })).toBeNull();
  });

  test("a passed-out board, and no memory at all, say nothing", () => {
    expect(
      impliedByLastTime(bidding("H", 0), { played: outcome({ contract: null }), view: seat0 }),
    ).toBeNull();
    expect(impliedByLastTime(bidding("H", 0), { played: null, view: seat0 })).toBeNull();
  });
});

/** One run of a board through the draw, recording what each seat was offered. */
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

describe("the result reaching the bidder", () => {
  /**
   * The wiring end to end, which the rule above cannot check on its own: the host
   * records an outcome beside the pairs, the seat identifies the board it is on from
   * the cards alone, and what comes back carries the result. Break any of the three and
   * this fails while every assertion above still passes.
   */
  test("a board identified on its replay brings its result with it", () => {
    const board = 4242;
    const first = run(board, 0);
    const played = outcome({ declared: true, tricksWon: [9, 4] });
    const memory: BoardMemory = [{ board, offers: first.offers[0]!, result: played }];

    const replay = run(board, 1);
    const view = viewFor(replay.state, 0);
    const found = boardFacing(memory, offeredSoFar(view, replay.state.discards[0]!));

    expect(found).not.toBeNull();
    expect(found!.result).toEqual(played);
    // And it is still the pairs the opponent now faces, which is what the sampler wants.
    expect(found!.offers).toHaveLength(13);
  });

  test("a memory recorded without a result is still usable for the pairs", () => {
    const board = 77;
    const first = run(board, 0);
    const memory: BoardMemory = [{ board, offers: first.offers[0]! }];

    const replay = run(board, 1);
    const view = viewFor(replay.state, 0);
    const found = boardFacing(memory, offeredSoFar(view, replay.state.discards[0]!));

    expect(found).not.toBeNull();
    expect(found!.result).toBeUndefined();
  });
});
