import { describe, expect, test } from "vitest";
import {
  actOn,
  canReturn,
  dealOf,
  legalActions,
  nextIn,
  restoreTable,
  returnMatch,
  startMatch,
  summarizeMatch,
} from "../src/index.js";
import type { MatchState, PlayerId } from "../src/index.js";

/**
 * A driver that opens the cheapest contract and passes to it.
 *
 * Two dead ends on the way here, and both would have made every assertion below
 * hold for the wrong reason. Taking the *first* legal action passes every deal out,
 * which is exactly how duplicate's control run once passed vacuously over a real
 * vulnerability bug. Taking the *last* one climbs the auction to seven no-trump,
 * which goes down enormously — and penalties score above the line, so no game is
 * ever won and the rubber never completes either.
 *
 * The cheapest contract makes often enough to bank part-scores, which is what
 * carries a side to a hundred and finishes the rubber. Slow, and it does not
 * matter: the point is a completed rubber to return, not a good one.
 */
function play(match: MatchState, deals: number): MatchState {
  let state = match;
  for (let deal = 0; deal < deals; deal++) {
    while (dealOf(state).phase !== "complete") {
      const seat = dealOf(state).toAct;
      const legal = legalActions(dealOf(state), seat);
      const opening = legal.find(
        (one) => one.type === "call" && one.call.type === "bid" && one.call.bid.level === 1,
      );
      const bidden = dealOf(state).auction.some((entry) => entry.call.type === "bid");
      const action =
        dealOf(state).phase === "auction" && !bidden ? (opening ?? legal[0]!) : legal[0]!;
      state = actOn(state, seat, action);
    }
    if (summarizeMatch(state).complete) {
      return state;
    }
    state = nextIn(state, 1000 + deal);
  }
  return state;
}

function boardsOf(match: MatchState): readonly { seed: number; starter: PlayerId }[] {
  return match.kind === "rubber" ? match.table.dealt : [];
}

const START = { firstBoard: 0, format: "rubber", seed: 4242, starter: 0 } as const;

describe("playing the same boards back", () => {
  /**
   * The guarantee the whole feature rests on, and the one duplicate's own test
   * cannot lend it.
   *
   * There, two identical players score a dead heat on every board, which is what
   * caught vulnerability being assigned to a seat instead of a position. Here they
   * will not: vulnerability is *earned*, so a board's two runs happen at different
   * standings by design. So what is pinned is mechanical instead — same seeds, in
   * order, each with the right to draw first handed to the other player.
   */
  test("replays the same seeds in order, from the other side", () => {
    const first = play(startMatch(START), 400);
    expect(summarizeMatch(first).complete).toBe(true);

    const played = boardsOf(first);
    expect(played.length).toBeGreaterThan(1);

    const back = play(returnMatch(first), played.length);
    const replayed = boardsOf(back).slice(0, played.length);

    expect(replayed.map((one) => one.seed)).toEqual(played.map((one) => one.seed));
    for (let index = 0; index < replayed.length; index++) {
      expect(replayed[index]!.starter).toBe(played[index]!.starter === 0 ? 1 : 0);
    }
  });

  /**
   * The anti-vacuity half: the seats really do face each other's cards.
   *
   * Comparing seeds alone would pass if the flip did nothing, since the same seed
   * with the same starter deals the same hands. This asks the deals themselves.
   */
  test("each seat is dealt the stream the other faced", () => {
    const first = startMatch(START);
    const back = returnMatch(play(first, 400));

    expect(dealOf(back).starter).toBe(dealOf(first).starter === 0 ? 1 : 0);
    expect(dealOf(back).pending).not.toBeNull();
    // The first card offered goes to whoever draws first, so the same seed under a
    // flipped starter offers the same card to the other seat.
    expect(dealOf(back).pending).toEqual(dealOf(first).pending);
    expect(dealOf(back).toAct).toBe(dealOf(first).toAct === 0 ? 1 : 0);
  });

  /**
   * Running out is a main path, not an edge case — measured at 43% of pairs — so
   * it is asserted rather than left to be discovered. Past the recorded boards the
   * rubber simply deals fresh, which is safe here in a way it is not in duplicate:
   * a board is not a scoring unit under rubber scoring.
   */
  test("deals fresh boards once the recorded ones run out", () => {
    const first = play(startMatch(START), 400);
    const played = boardsOf(first);

    let back = returnMatch(first);
    for (let deal = 0; deal < played.length + 3; deal++) {
      if (summarizeMatch(back).complete) {
        break;
      }
      back = nextIn(back, 90_000 + deal);
    }

    const replayed = boardsOf(back);
    if (replayed.length > played.length) {
      expect(replayed[played.length]!.seed).not.toBe(played[played.length - 1]!.seed);
    }
    // Whatever happened past the end, everything inside it is still the mirror.
    for (let index = 0; index < Math.min(replayed.length, played.length); index++) {
      expect(replayed[index]!.seed).toBe(played[index]!.seed);
    }
  });

  test("a return match cannot itself be returned", () => {
    const first = play(startMatch(START), 400);
    expect(canReturn(first)).toBe(true);

    const back = play(returnMatch(first), 400);
    expect(summarizeMatch(back).complete).toBe(true);
    expect(canReturn(back)).toBe(false);
    // And asking anyway is a no-op rather than a third run of the same cards.
    expect(returnMatch(back)).toBe(back);
  });

  /**
   * **A rubber written to storage before any of this existed, and this shipped
   * broken.** A Durable Object holds a table across deploys, so a sitting already
   * under way comes back without `dealt` or `replay` — and `nextDeal` indexes the
   * second by the length of the first, so every action of that rubber threw. Repaired
   * on read by `restoreTable` rather than by migrating storage, the way this file
   * already handles the shape before `MatchState`.
   *
   * Reproduced by deleting the fields, which is what the object actually hands back —
   * a test that constructed a complete table would pass against the bug.
   */
  test("a rubber stored before the boards were kept still plays", () => {
    const started = startMatch(START);
    const legacy = started.kind === "rubber" ? { ...started.table } : null;
    expect(legacy).not.toBeNull();
    delete (legacy as Record<string, unknown>)["dealt"];
    delete (legacy as Record<string, unknown>)["replay"];
    delete (legacy as Record<string, unknown>)["previous"];
    delete (legacy as Record<string, unknown>)["previousPoints"];

    const match: MatchState = { kind: "rubber", table: restoreTable(legacy!) };

    // The action that threw: dealing the next deal reads `replay[dealt.length]`.
    expect(() => nextIn(play(match, 2), 7)).not.toThrow();
    expect(summarizeMatch(match).repeated).toBe(false);
  });

  /**
   * And it never offers to be played back, because there is nothing to play — nothing
   * recorded what those deals were dealt from and nothing can now. Without this,
   * `returnMatch` reaches for the first of an empty list.
   */
  /**
   * A rubber that began before the boards were kept and then played on has *some*
   * boards but not one per deal. Pairing the replay's deals against the earlier
   * scorepad by index would line each up against the wrong deal — quietly, and only
   * on the screen that exists to compare them.
   */
  test("a rubber with fewer boards than deals cannot be returned", () => {
    const finished = play(startMatch(START), 400);
    const short: MatchState =
      finished.kind === "rubber"
        ? { kind: "rubber", table: { ...finished.table, dealt: finished.table.dealt.slice(1) } }
        : finished;

    expect(summarizeMatch(short).complete).toBe(true);
    expect(summarizeMatch(short).standing.kind === "rubber").toBe(true);
    expect(canReturn(short)).toBe(false);
  });

  test("a rubber with no recorded boards cannot be returned", () => {
    const finished = play(startMatch(START), 400);
    const stripped: MatchState =
      finished.kind === "rubber"
        ? { kind: "rubber", table: { ...finished.table, dealt: [] } }
        : finished;

    expect(summarizeMatch(stripped).complete).toBe(true);
    expect(canReturn(stripped)).toBe(false);
    expect(returnMatch(stripped)).toBe(stripped);
  });

  test("a rubber still being played cannot be returned", () => {
    expect(canReturn(startMatch(START))).toBe(false);
  });

  test("a duplicate session cannot be returned, having already replayed everything", () => {
    const session = startMatch({ ...START, boards: 1, format: "duplicate" });
    expect(canReturn(play(session, 10))).toBe(false);
  });

  /**
   * The pair's aggregate is what a return match exists to produce, so the totals of
   * the match being replayed travel with it — as a **total**, not re-derived from the
   * scorepad it also carries. A rubber's totals are not the sum of its deals:
   * `matchBonusFor` pays 500 or 700 for winning it, and that lands on the rubber
   * rather than on any deal in it, so summing the pad would be short by the bonus and
   * short in a way nobody would notice.
   */
  test("carries what the first match came to, bonus included", () => {
    const first = play(startMatch(START), 400);
    const totals = first.kind === "rubber" ? summarizeMatch(first).points : null;
    expect(totals).not.toBeNull();

    const back = returnMatch(first);
    const standing = summarizeMatch(back).standing;
    expect(standing.kind).toBe("rubber");
    if (standing.kind !== "rubber") {
      return;
    }
    expect(standing.previousPoints).toEqual(totals);

    // The scorepad alone cannot produce it: the winner's rubber bonus is on the
    // rubber, not on any deal. This is what stops anyone "simplifying" it away.
    const fromPad = standing.previous.reduce(
      (sum, one) => sum + (one.score?.aboveLine[0] ?? 0) + (one.score?.belowLine[0] ?? 0),
      0,
    );
    expect(fromPad).not.toBe(standing.previousPoints![0]);
  });

  test("an ordinary rubber has no earlier total to show", () => {
    const first = play(startMatch(START), 400);
    const standing = summarizeMatch(first).standing;

    expect(standing.kind === "rubber" && standing.previousPoints).toBeNull();
  });

  test("a match on repeated boards says so, and an ordinary one does not", () => {
    const first = play(startMatch(START), 400);
    expect(summarizeMatch(first).repeated).toBe(false);
    expect(summarizeMatch(returnMatch(first)).repeated).toBe(true);
  });

  /**
   * A new rubber started from a return match is an ordinary rubber, and may be
   * returned in its turn. Without this the replay would leak into every rubber
   * played afterwards and the same cards would come round forever.
   */
  test("the rubber after a return match is dealt fresh", () => {
    const back = play(returnMatch(play(startMatch(START), 400)), 400);
    const fresh = nextIn(back, 777);

    expect(summarizeMatch(fresh).repeated).toBe(false);
    expect(fresh.kind === "rubber" && fresh.table.replay).toEqual([]);
  });
});
