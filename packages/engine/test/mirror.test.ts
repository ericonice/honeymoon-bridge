import { describe, expect, test } from "vitest";
import {
  actOn,
  canReturn,
  dealOf,
  halfOf,
  legalActions,
  nextIn,
  startMatch,
  summarizeMatch,
} from "../src/index.js";
import type { MatchState } from "../src/index.js";

/**
 * Opens the cheapest contract and passes to it, for the reasons `returnMatch.test.ts`
 * records: the first legal action passes every deal out, and the last climbs to seven
 * no-trump, whose penalties score above the line so no game is ever won.
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
    state = nextIn(state, 5000 + deal);
  }
  return state;
}

/** Plays to the end of the half in progress, without crossing into the next. */
function toEndOfHalf(match: MatchState): MatchState {
  let state = match;
  for (let deal = 0; deal < 400; deal++) {
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
    const standing = summarizeMatch(state).standing;
    if (standing.kind === "rubber" && standing.rubber.complete) {
      return state;
    }
    state = nextIn(state, 5000 + deal);
  }
  return state;
}

const START = { firstBoard: 0, format: "mirror", seed: 90210, starter: 0 } as const;

function boards(match: MatchState): readonly { seed: number; starter: number }[] {
  return match.kind === "mirror" || match.kind === "rubber" ? match.table.dealt : [];
}

describe("two games on one set of boards", () => {
  test("stays a two-game match through an action and a deal", () => {
    // Both a mirror and a rubber carry a `table`, so a hard-coded `{ kind: "rubber" }`
    // in `actOn` or `nextIn` type-checks perfectly and silently demotes the match.
    // Nothing but this notices.
    const started = startMatch(START);
    const acted = actOn(started, dealOf(started).toAct, legalActions(dealOf(started), dealOf(started).toAct)[0]!);

    expect(acted.kind).toBe("mirror");
    expect(summarizeMatch(acted).format).toBe("mirror");
  });

  test("each half is a single game, scored as one", () => {
    const started = startMatch(START);

    expect(started.kind === "mirror" && started.table.rubberBefore.format).toBe("game");
    expect(halfOf(started as never)).toBe(1);
  });

  /** The mechanic, and the same guarantee the return match rests on. */
  test("the second half replays the first's boards from the other side", () => {
    const first = toEndOfHalf(startMatch(START));
    expect(first.kind).toBe("mirror");
    const played = boards(first);
    expect(played.length).toBeGreaterThan(0);

    const second = nextIn(first, 11);
    expect(second.kind).toBe("mirror");
    expect(halfOf(second as never)).toBe(2);

    const replayed = second.kind === "mirror" ? second.table.replay : [];
    expect(replayed.map((one) => one.seed)).toEqual(played.map((one) => one.seed));
    for (let index = 0; index < replayed.length; index++) {
      expect(replayed[index]!.starter).toBe(played[index]!.starter === 0 ? 1 : 0);
    }
  });

  /**
   * **Winning the first half decides nothing**, which is the whole point of the
   * format and the thing most likely to be broken by treating a half like a rubber.
   */
  test("is not over when the first half is", () => {
    const first = toEndOfHalf(startMatch(START));
    const summary = summarizeMatch(first);

    expect(summary.standing.kind === "rubber" && summary.standing.rubber.complete).toBe(true);
    expect(summary.complete).toBe(false);
    expect(summary.winner).toBeNull();
  });

  /**
   * **Half time has to be announceable, and for a while it was not.** The hands reveal
   * offers a tap straight into the next deal unless the *match* is over — so the end of
   * the first game walked the player into the second with nothing having said the first
   * had finished, and the screen written for that moment was unreachable. This is the
   * one value both the reveal and `DealComplete` read, so they cannot disagree about
   * whether the moment happened.
   */
  test("says when the first game is over, and only then", () => {
    const started = startMatch(START);
    expect(summarizeMatch(started).halfComplete).toBe(false);

    const first = toEndOfHalf(started);
    expect(summarizeMatch(first).halfComplete).toBe(true);
    expect(summarizeMatch(first).complete).toBe(false);

    // Into the second game: no longer half time, and not yet over.
    const second = nextIn(first, 11);
    expect(summarizeMatch(second).halfComplete).toBe(false);

    // And the end of the *match* is not half time either.
    const done = play(second, 400);
    expect(summarizeMatch(done).complete).toBe(true);
    expect(summarizeMatch(done).halfComplete).toBe(false);
  });

  test("an ordinary rubber never reports half time", () => {
    const rubber = play(startMatch({ ...START, format: "rubber" }), 400);

    expect(summarizeMatch(rubber).complete).toBe(true);
    expect(summarizeMatch(rubber).halfComplete).toBe(false);
  });

  test("the verdict is the pair's total, not either half's", () => {
    const first = toEndOfHalf(startMatch(START));
    const firstTotals = summarizeMatch(first).points;

    const done = play(nextIn(first, 11), 400);
    const summary = summarizeMatch(done);
    expect(summary.complete).toBe(true);

    const standing = summary.standing;
    expect(standing.kind).toBe("rubber");
    if (standing.kind !== "rubber") {
      return;
    }
    // The reported total is the two halves added, and the earlier half is carried
    // rather than re-derived — a rubber's totals are not the sum of its deals.
    const earlier = standing.previousPoints!;
    expect(earlier).toEqual(firstTotals);
    expect(summary.points[0]).toBeGreaterThanOrEqual(earlier[0]);

    const expected =
      summary.points[0] === summary.points[1] ? null : summary.points[0] > summary.points[1] ? 0 : 1;
    expect(summary.winner).toBe(expected);
  });

  /**
   * **The match winner and the current game's winner are different facts**, and reading
   * the second where the first was meant is what shipped: a player who won on the total
   * was told the computer had taken it, because the computer won the second game. The
   * recorded result was right the whole time, which is the worst shape for it — the
   * screen and the database disagreed and only the screen was wrong.
   *
   * Driven until the two genuinely differ, so this cannot pass by them happening to
   * agree. If no seed in the range produces that, the test says so rather than passing
   * quietly, since a disagreement it never saw is a disagreement it never tested.
   */
  test("the match winner is the total's, not the second game's", () => {
    let differed = false;

    for (let seed = 1; seed <= 40 && !differed; seed++) {
      const done = play(startMatch({ ...START, seed: seed * 1013 }), 400);
      const summary = summarizeMatch(done);
      if (!summary.complete || summary.standing.kind !== "rubber") {
        continue;
      }
      const secondGame = summary.standing.rubber.winner;
      if (secondGame === summary.winner) {
        continue;
      }

      differed = true;
      // Whoever the second game went to, the match follows the total and nothing else.
      const points = summary.points;
      const byTotal =
        points[0] === points[1] ? null : points[0] > points[1] ? 0 : 1;
      expect(summary.winner).toBe(byTotal);
      expect(summary.winner).not.toBe(secondGame);
    }

    expect(differed).toBe(true);
  });

  /** A pair is never offered a return match: it already is one. */
  test("cannot be played back again", () => {
    const done = play(startMatch(START), 400);

    expect(summarizeMatch(done).complete).toBe(true);
    expect(canReturn(done)).toBe(false);
  });

  test("the pair after a finished pair is dealt fresh", () => {
    const done = play(startMatch(START), 400);
    const again = nextIn(done, 4242);

    expect(again.kind).toBe("mirror");
    expect(halfOf(again as never)).toBe(1);
    expect(summarizeMatch(again).complete).toBe(false);
    expect(again.kind === "mirror" && again.table.previousPoints).toBeNull();
  });
});
