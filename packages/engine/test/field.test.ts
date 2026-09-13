import { describe, expect, it } from "vitest";
import { legalActions } from "../src/deal.js";
import {
  applyFieldAction,
  boardPercentageOf,
  currentFieldBoard,
  humanPercentageOf,
  matchpointsOf,
  netFor,
  nextFieldDeal,
  startField,
  summarizeField,
  withField,
} from "../src/field.js";
import type { FieldBoard, FieldEntry, FieldState } from "../src/field.js";
import type { Pair, PlayerId } from "../src/types.js";

const ME: PlayerId = 0;

function board(id: string, seed: number, starter: PlayerId, vulnerable: Pair<boolean>): FieldBoard {
  return { id, seed, starter, vulnerable };
}

const BOARDS: readonly FieldBoard[] = [
  board("b1", 90_001, 0, [false, false]),
  board("b2", 90_002, 1, [true, false]),
  board("b3", 90_003, 0, [false, true]),
];

/**
 * Drives one deal to the end, opening the cheapest contract rather than passing.
 *
 * **Taking the first legal action everywhere passes every deal out**, which scores
 * nothing and would leave every margin assertion below testing zero against zero —
 * the same dead end `returnMatch.test.ts` hit and the reason it is worth spelling
 * out here rather than reaching for the dull driver.
 */
function playDeal(state: FieldState): FieldState {
  let current = state;
  for (let guard = 0; guard < 400; guard += 1) {
    if (current.deal.phase === "complete") {
      return current;
    }
    const seat = current.deal.toAct;
    const legal = legalActions(current.deal, seat).filter((one) => one.type !== "claim");
    // A bid if one is on offer and nothing has been bid yet, so the deal is scored.
    const opening =
      current.deal.contract === null
        ? legal.find((one) => one.type === "call" && one.call.type === "bid")
        : undefined;
    current = applyFieldAction(current, seat, opening ?? legal[0]!);
  }
  throw new Error("deal did not finish");
}

function playSession(state: FieldState): FieldState {
  let current = state;
  for (let guard = 0; guard < 20; guard += 1) {
    current = playDeal(current);
    if (summarizeField(current).complete) {
      return current;
    }
    current = nextFieldDeal(current);
  }
  throw new Error("session did not finish");
}

function entry(points: number, kind: FieldEntry["kind"] = "computer"): FieldEntry {
  return { contract: null, kind, points, tricks: null, who: kind === "computer" ? "Computer" : "Noah" };
}

describe("a board of a field session", () => {
  it("is dealt from its own stock and its own side of it", () => {
    const state = startField({ boards: BOARDS, me: ME });

    expect(state.deal.starter).toBe(BOARDS[0]!.starter);
    expect(currentFieldBoard(state)?.id).toBe("b1");
  });

  /**
   * The second board takes the *other* starter, which is what makes the two streams
   * of a stock separate boards rather than one board seen twice. Asserted against the
   * board rather than against a constant, so a fixture that stopped varying it would
   * fail here rather than pass quietly.
   */
  it("takes each board's own starter as it goes", () => {
    const first = startField({ boards: BOARDS, me: ME });
    const second = nextFieldDeal(playDeal(first));

    expect(BOARDS[0]!.starter).not.toBe(BOARDS[1]!.starter);
    expect(second.deal.starter).toBe(BOARDS[1]!.starter);
  });

  it("plays every board exactly once and then is complete", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const summary = summarizeField(done);

    expect(summary.complete).toBe(true);
    expect(summary.boardsPlayed).toBe(BOARDS.length);
    expect(summary.results.map((one) => one.board.id)).toEqual(["b1", "b2", "b3"]);
  });

  /**
   * `results[i]` describes `boards[i]`, so "already committed" is `results.length >
   * at` and nothing has to remember whether this was called twice. The session
   * version of this bug grew a third run onto its last board.
   */
  it("does not commit the same board twice when asked to move on again", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const again = nextFieldDeal(nextFieldDeal(done));

    expect(summarizeField(again).boardsPlayed).toBe(BOARDS.length);
    expect(again.results.map((one) => one.board.id)).toEqual(["b1", "b2", "b3"]);
  });
});

describe("where a board places", () => {
  /**
   * §1.8a: the field is fetched only once the deal is over, so a board played and
   * not yet ranked is a real state — and it must not read as a board scored nought.
   */
  it("has no placing at all until the field arrives, rather than a placing of zero", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const summary = summarizeField(done);

    expect(summary.boardsRanked).toBe(0);
    expect(summary.percentage).toBeNull();
    for (const result of summary.results) {
      expect(boardPercentageOf(result, ME)).toBeNull();
    }
  });

  it("attaches a late field to the board it belongs to", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const withOne = withField(done, "b2", [entry(120)]);
    const summary = summarizeField(withOne);

    expect(summary.boardsRanked).toBe(1);
    expect(summary.results.find((one) => one.board.id === "b2")?.field).toHaveLength(1);
    expect(summary.results.find((one) => one.board.id === "b1")?.field).toBeNull();
  });

  it("ignores a field for a board this session is not playing", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));

    expect(withField(done, "elsewhere", [entry(120)])).toBe(done);
  });

  /** A board nobody else has played is unranked, not a wipe-out. */
  it("has no placing on a board whose field is empty", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const alone = withField(done, "b1", []);

    expect(boardPercentageOf(summarizeField(alone).results[0]!, ME)).toBeNull();
    expect(summarizeField(alone).boardsRanked).toBe(0);
  });

  it("takes the placing from this seat's own score", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const mine = netFor(summarizeField(done).results[0]!.points, ME);
    const beaten = withField(done, "b1", [entry(mine - 100), entry(mine - 50)]);

    expect(boardPercentageOf(summarizeField(beaten).results[0]!, ME)).toBe(100);
  });
});

describe("matchpoints", () => {
  it("pays two for a result beaten and one for a result tied", () => {
    expect(matchpointsOf(500, [entry(100), entry(200)])).toBe(100);
    expect(matchpointsOf(100, [entry(100), entry(200)])).toBe(25);
    expect(matchpointsOf(0, [entry(100), entry(200)])).toBe(0);
    expect(matchpointsOf(150, [entry(100), entry(200)])).toBe(50);
  });

  /**
   * The reason the output is a percentage rather than a count of results beaten:
   * fields differ in size once boards fill unevenly, and a count is not comparable
   * across two boards where a percentage is.
   */
  it("reads the same on fields of different sizes", () => {
    const two = matchpointsOf(300, [entry(100), entry(200)]);
    const four = matchpointsOf(300, [entry(100), entry(150), entry(200), entry(250)]);

    expect(two).toBe(100);
    expect(four).toBe(two);
  });

  it("says nothing at all for an empty field", () => {
    expect(matchpointsOf(300, [])).toBeNull();
  });

  /**
   * §1.8a: a percentage made against machine scaffolding is not the same claim as
   * one made against people, and a bare figure cannot tell them apart.
   */
  it("ranks against people separately, and says nothing until there are any", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const mine = netFor(summarizeField(done).results[0]!.points, ME);

    const machines = withField(done, "b1", [entry(mine + 100), entry(mine + 200)]);
    expect(boardPercentageOf(summarizeField(machines).results[0]!, ME)).toBe(0);
    expect(humanPercentageOf(summarizeField(machines).results[0]!, ME)).toBeNull();

    const mixed = withField(done, "b1", [entry(mine + 100), entry(mine - 100, "table")]);
    expect(boardPercentageOf(summarizeField(mixed).results[0]!, ME)).toBe(50);
    expect(humanPercentageOf(summarizeField(mixed).results[0]!, ME)).toBe(100);
  });
});

describe("a session's own figure", () => {
  /**
   * The mean rather than a total, so a board whose field has not come back does not
   * quietly drag the session down — it is simply not in the average yet.
   */
  it("averages the boards that have been ranked and ignores the rest", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const results = summarizeField(done).results;
    const ranked = withField(
      withField(done, "b1", [entry(netFor(results[0]!.points, ME) - 10)]),
      "b3",
      [entry(netFor(results[2]!.points, ME) + 10)],
    );
    const summary = summarizeField(ranked);

    expect(summary.boardsRanked).toBe(2);
    expect(summary.boardsPlayed).toBe(3);
    expect(summary.percentage).toBe(50);
  });
});
