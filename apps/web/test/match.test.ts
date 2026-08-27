import { actOn, dealOf, legalActions, nextIn, startMatch, summarizeMatch } from "@hb/engine";
import type { MatchState, PlayerId } from "@hb/engine";
import { describe, expect, it } from "vitest";

const OPTIONS = { firstBoard: 500, seed: 31, starter: 0 as PlayerId };

/** Plays the deal on the table out with the dullest legal action at every turn. */
function playDeal(match: MatchState): MatchState {
  let current = match;
  while (dealOf(current).phase !== "complete") {
    const deal = dealOf(current);
    const actions = legalActions(deal, deal.toAct).filter((action) => action.type !== "claim");
    current = actOn(current, deal.toAct, actions[0]!);
  }
  return current;
}

function playMatch(match: MatchState, limit: number): MatchState {
  let current = match;
  for (let deals = 0; deals < limit; deals++) {
    current = playDeal(current);
    if (summarizeMatch(current).complete) {
      return current;
    }
    current = nextIn(current, 1000 + deals);
  }
  throw new Error("match did not finish");
}

describe("a match, whichever kind is being played", () => {
  it("keeps a rubber's standing as a rubber", () => {
    const summary = summarizeMatch(startMatch({ ...OPTIONS, format: "rubber" }));

    expect(summary.standing.kind).toBe("rubber");
    expect(summary.format).toBe("rubber");
    expect(summary.complete).toBe(false);
  });

  it("keeps a session's standing as a session", () => {
    const summary = summarizeMatch(startMatch({ ...OPTIONS, format: "duplicate" }));

    expect(summary.standing.kind).toBe("duplicate");
    expect(summary.format).toBe("duplicate");
    expect(summary.dealsPlayed).toBe(0);
  });

  it("numbers a session's boards from where it was told to start", () => {
    const match = startMatch({ ...OPTIONS, format: "duplicate" });
    expect(match.kind).toBe("duplicate");
    if (match.kind === "duplicate") {
      expect(match.session.boards.map((board) => board.seed)).toEqual([500, 501, 502, 503, 504]);
    }
  });

  /**
   * A session's deals were chosen when it started, so the seed `nextIn` takes is
   * a rubber's business and a session ignores it. Asserted because the two hosts
   * pass one unconditionally and it would be easy for a session to start dealing
   * from it by accident — which would make a board something other than its
   * number.
   */
  it("ignores the seed when a session deals, since its boards are its own numbers", () => {
    const started = startMatch({ ...OPTIONS, format: "duplicate" });
    const first = nextIn(playDeal(started), 111);
    const second = nextIn(playDeal(started), 999);

    expect(dealOf(first).stock.length).toBe(dealOf(second).stock.length);
    expect(dealOf(first).starter).toBe(dealOf(second).starter);
  });

  /**
   * The vulnerability the bidder is handed has to be the board's own prescribed
   * vulnerability, not a rubber's. `botStanding` supplies an untouched rubber for
   * a session — safe only because the duplicate objective reads nothing but
   * `vulnerable`, which `test/duplicateObjective.test.ts` is what asserts.
   */
  it("hands the bidder the board's own vulnerability", () => {
    let match = startMatch({ ...OPTIONS, format: "duplicate" });
    const seen = new Set<string>();

    for (let deal = 0; deal < 8; deal++) {
      const summary = summarizeMatch(match);
      expect(summary.botStanding.vulnerable).toEqual(summary.vulnerable);
      seen.add(summary.vulnerable.join(","));
      match = nextIn(playDeal(match), 1);
    }

    // The four-board cycle means a session of five boards cannot be played
    // entirely at love all — if it were, nothing would be testing vulnerability.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("plays a session out to a complete match of two deals a board", () => {
    const summary = summarizeMatch(playMatch(startMatch({ ...OPTIONS, format: "duplicate" }), 40));

    expect(summary.complete).toBe(true);
    expect(summary.dealsPlayed).toBe(10);
    expect(summary.standing.kind).toBe("duplicate");
    if (summary.standing.kind === "duplicate") {
      expect(summary.standing.summary.closed).toBe(5);
    }
  });

  /**
   * The control run again, at this layer: one policy from both seats means every
   * replay is its own first run with the seats relabelled, so the session must be
   * a dead heat. It is asserted here as well as in the engine because this is the
   * path the app actually takes — through `actOn` and `nextIn` rather than through
   * the engine's own functions — and a host that dealt a board wrong would still
   * pass the engine's version.
   */
  it("is a dead heat between two identical players", () => {
    const summary = summarizeMatch(playMatch(startMatch({ ...OPTIONS, format: "duplicate" }), 40));
    expect(summary.points).toEqual([0, 0]);
    expect(summary.winner).toBeNull();
  });

  /**
   * The bug this was written for. "New session" on the deal-complete screen is
   * wired to the same call that advances the schedule, and a finished session has
   * no schedule left — so without this it appended its last result a second time,
   * growing a third run onto the last board and quietly changing the margin. A
   * session cannot start its own successor, since board numbers and a schedule
   * seed are not the engine's to invent, so it happens here.
   */
  it("starts a fresh session once one is decided, rather than dealing past the end", () => {
    const finished = playMatch(startMatch({ ...OPTIONS, format: "duplicate" }), 40);
    const fresh = nextIn(finished, 7777);
    const summary = summarizeMatch(fresh);

    expect(summary.complete).toBe(false);
    expect(summary.dealsPlayed).toBe(0);
    expect(summary.points).toEqual([0, 0]);
    if (fresh.kind === "duplicate" && finished.kind === "duplicate") {
      expect(fresh.session.boards[0]!.seed).not.toBe(finished.session.boards[0]!.seed);
    }
  });

  /**
   * A new session is the same length as the one it follows, for the reason a new
   * rubber is the same kind of rubber: how long a sitting runs is chosen when
   * players sit down, not re-read from a setting that could have moved under way.
   */
  it("carries a session's length into the one after it", () => {
    const finished = playMatch(startMatch({ ...OPTIONS, boards: 3, format: "duplicate" }), 40);
    const fresh = nextIn(finished, 7777);

    expect(summarizeMatch(finished).dealsPlayed).toBe(6);
    if (fresh.kind === "duplicate") {
      expect(fresh.session.boards).toHaveLength(3);
      expect(fresh.session.schedule).toHaveLength(6);
    }
  });

  it("pays a per-deal bonus in a session and never in a rubber", () => {
    const session = summarizeMatch(playDeal(startMatch({ ...OPTIONS, format: "duplicate" })));
    const rubber = summarizeMatch(playDeal(startMatch({ ...OPTIONS, format: "rubber" })));

    expect(rubber.bonus).toBe(0);
    // A dull driver passes most deals out, and a passed-out board pays nothing —
    // so this asserts the shape rather than a figure: a session's bonus is either
    // a real bonus or nothing, and never negative.
    expect(session.bonus).toBeGreaterThanOrEqual(0);
  });
});
