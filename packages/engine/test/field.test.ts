import { describe, expect, it } from "vitest";
import { legalActions } from "../src/deal.js";
import { summarizeMatch } from "../src/match.js";
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

/** Both sides named, since a table plays one stock from either end at once. */
function board(id: string, seed: number, starter: PlayerId, vulnerable: Pair<boolean>): FieldBoard {
  return { ids: [id, `${id}-other`], seed, starter, vulnerable };
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
    if (summarizeField(current, ME).complete) {
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
    const state = startField({ boards: BOARDS });

    expect(state.deal.starter).toBe(BOARDS[0]!.starter);
    expect(currentFieldBoard(state)?.ids[0]).toBe("b1");
  });

  /**
   * The second board takes the *other* starter, which is what makes the two streams
   * of a stock separate boards rather than one board seen twice. Asserted against the
   * board rather than against a constant, so a fixture that stopped varying it would
   * fail here rather than pass quietly.
   */
  it("takes each board's own starter as it goes", () => {
    const first = startField({ boards: BOARDS });
    const second = nextFieldDeal(playDeal(first));

    expect(BOARDS[0]!.starter).not.toBe(BOARDS[1]!.starter);
    expect(second.deal.starter).toBe(BOARDS[1]!.starter);
  });

  it("plays every board exactly once and then is complete", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const summary = summarizeField(done, ME);

    expect(summary.complete).toBe(true);
    expect(summary.boardsPlayed).toBe(BOARDS.length);
    expect(summary.results.map((one) => one.board.ids[0])).toEqual(["b1", "b2", "b3"]);
  });

  /**
   * `results[i]` describes `boards[i]`, so "already committed" is `results.length >
   * at` and nothing has to remember whether this was called twice. The session
   * version of this bug grew a third run onto its last board.
   */
  it("does not commit the same board twice when asked to move on again", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const again = nextFieldDeal(nextFieldDeal(done));

    expect(summarizeField(again, ME).boardsPlayed).toBe(BOARDS.length);
    expect(again.results.map((one) => one.board.ids[0])).toEqual(["b1", "b2", "b3"]);
  });
});

describe("where a board places", () => {
  /**
   * §1.8a: the field is fetched only once the deal is over, so a board played and
   * not yet ranked is a real state — and it must not read as a board scored nought.
   */
  it("has no placing at all until the field arrives, rather than a placing of zero", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const summary = summarizeField(done, ME);

    expect(summary.boardsRanked).toBe(0);
    expect(summary.percentage).toBeNull();
    for (const result of summary.results) {
      expect(boardPercentageOf(result, ME)).toBeNull();
    }
  });

  it("attaches a late field to the board it belongs to", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const withOne = withField(done, "b2", ME, [entry(120)]);
    const summary = summarizeField(withOne, ME);

    expect(summary.boardsRanked).toBe(1);
    expect(summary.results.find((one) => one.board.ids[0] === "b2")?.field[ME]).toHaveLength(1);
    expect(summary.results.find((one) => one.board.ids[0] === "b1")?.field[ME]).toBeNull();
  });

  it("ignores a field for a board this session is not playing", () => {
    const done = playSession(startField({ boards: BOARDS }));

    expect(withField(done, "elsewhere", ME, [entry(120)])).toBe(done);
  });

  /** A board nobody else has played is unranked, not a wipe-out. */
  it("has no placing on a board whose field is empty", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const alone = withField(done, "b1", ME, []);

    expect(boardPercentageOf(summarizeField(alone, ME).results[0]!, ME)).toBeNull();
    expect(summarizeField(alone, ME).boardsRanked).toBe(0);
  });

  it("takes the placing from this seat's own score", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const mine = netFor(summarizeField(done, ME).results[0]!.points, ME);
    const beaten = withField(done, "b1", ME, [entry(mine - 100), entry(mine - 50)]);

    expect(boardPercentageOf(summarizeField(beaten, ME).results[0]!, ME)).toBe(100);
  });
});

describe("two seats at one board", () => {
  /**
   * **The whole reason a board's field is a `Pair`.** The two sides of a stock are
   * separate boards with separate histories, so each seat is ranked against its own —
   * and a session summarised for the wrong seat shows a player their opponent's
   * placing on every board, which is what `snapshotFor` would have sent before the
   * seat became an argument.
   */
  it("ranks each seat against its own side's results", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const mine = netFor(summarizeField(done, 0).results[0]!.points, 0);
    const theirs = netFor(summarizeField(done, 1).results[0]!.points, 1);

    // Each side is a board of its own, so each is filled by its own id.
    const both = withField(
      withField(done, "b1", 0, [entry(mine + 100)]),
      "b1-other",
      1,
      [entry(theirs - 100)],
    );

    expect(summarizeField(both, 0).percentage).toBe(0);
    expect(summarizeField(both, 1).percentage).toBe(100);
  });

  /** One seat's field arriving says nothing about the other's. */
  it("leaves the other seat unranked until its own results arrive", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const one = withField(done, "b1", 0, [entry(0)]);

    expect(summarizeField(one, 0).boardsRanked).toBe(1);
    expect(summarizeField(one, 1).boardsRanked).toBe(0);
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
    const done = playSession(startField({ boards: BOARDS }));
    const mine = netFor(summarizeField(done, ME).results[0]!.points, ME);

    const machines = withField(done, "b1", ME, [entry(mine + 100), entry(mine + 200)]);
    expect(boardPercentageOf(summarizeField(machines, ME).results[0]!, ME)).toBe(0);
    expect(humanPercentageOf(summarizeField(machines, ME).results[0]!, ME)).toBeNull();

    const mixed = withField(done, "b1", ME, [entry(mine + 100), entry(mine - 100, "table")]);
    expect(boardPercentageOf(summarizeField(mixed, ME).results[0]!, ME)).toBe(50);
    expect(humanPercentageOf(summarizeField(mixed, ME).results[0]!, ME)).toBe(100);
  });
});

describe("a session's own figure", () => {
  /**
   * The mean rather than a total, so a board whose field has not come back does not
   * quietly drag the session down — it is simply not in the average yet.
   */
  it("averages the boards that have been ranked and ignores the rest", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const results = summarizeField(done, ME).results;
    const ranked = withField(
      withField(done, "b1", ME, [entry(netFor(results[0]!.points, ME) - 10)]),
      "b3",
      ME,
      [entry(netFor(results[2]!.points, ME) + 10)],
    );
    const summary = summarizeField(ranked, ME);

    expect(summary.boardsRanked).toBe(2);
    expect(summary.boardsPlayed).toBe(3);
    expect(summary.percentage).toBe(50);
  });
});

/**
 * The verdict, which lives in `match.ts` and is tested here because this is where the
 * helpers for building a ranked session are.
 */
describe("who won a session", () => {
  /**
   * **The verdict reads the unrounded placing.** `points` is rounded, because every
   * screen and every stored row wants a whole number — and `winner` used to read that
   * rounded figure, so a session placed fractionally above 50% was recorded as *drawn*.
   *
   * The field here is deliberately large, because with the seven-result fields the
   * corpus ships today the case cannot arise at all: a board scores `k/2N`, so the
   * nearest value above 50% is 57.1% and the rounding window is never entered. It opens
   * once a board's field fills past about a hundred, which is what a corpus that people
   * keep playing eventually produces. Beat 51 and lose to 50 and the placing is
   * **50.495%** — rounds to 50, and is a win.
   */
  it("gives a session decided by a fraction of a point to the side that won it", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const mine = netFor(summarizeField(done, ME).results[0]!.points, ME);
    const ranked = withField(done, "b1", ME, [
      ...Array.from({ length: 51 }, () => entry(mine - 10)),
      ...Array.from({ length: 50 }, () => entry(mine + 10)),
    ]);

    const percentage = summarizeField(ranked, ME).percentage!;
    expect(Math.round(percentage)).toBe(50);
    expect(percentage).toBeGreaterThan(50);

    const summary = summarizeMatch({ kind: "field", session: ranked }, ME);
    // Rounded for the record, and the record is what the old verdict was read off.
    expect(summary.points[ME]).toBe(50);
    expect(summary.winner).toBe(ME);
  });

  /**
   * **A level session that floating point cannot say is level.**
   *
   * The percentage is a mean of per-board `(scored / 2n) * 100`, and a genuinely level
   * session lands on `49.99999999999999` about an eighth of the time — so comparing it
   * to fifty reads a dead heat as a win or a loss. Two boards, each against a field of
   * three: beaten 2 of 6 on one and 4 of 6 on the other. Exactly level, and the mean of
   * the two percentages is not exactly 50.
   *
   * Three-result fields are realistic rather than contrived: a board's field shrinks as
   * human results displace the generated ones.
   *
   * The assertion on the float is the point rather than a detail — it pins *why* the
   * verdict may not be read off it.
   */
  it("calls a level session drawn even when its percentage cannot say fifty", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const results = summarizeField(done, ME).results;
    const first = netFor(results[0]!.points, ME);
    const second = netFor(results[1]!.points, ME);
    const ranked = withField(
      withField(done, "b1", ME, [entry(first - 10), entry(first + 10), entry(first + 10)]),
      "b2",
      ME,
      [entry(second - 10), entry(second - 10), entry(second + 10)],
    );

    const summary = summarizeField(ranked, ME);
    expect(summary.boardsRanked).toBe(2);
    expect(summary.percentage).not.toBe(50);
    expect(summary.percentage).toBeCloseTo(50, 6);

    expect(summarizeMatch({ kind: "field", session: ranked }, ME).winner).toBeNull();
  });

  /** An exactly even split is still a draw, which is a real result in this format. */
  it("calls an exactly even session drawn", () => {
    const done = playSession(startField({ boards: BOARDS }));
    const mine = netFor(summarizeField(done, ME).results[0]!.points, ME);
    const ranked = withField(done, "b1", ME, [entry(mine - 10), entry(mine + 10)]);

    expect(summarizeField(ranked, ME).percentage).toBe(50);
    expect(summarizeMatch({ kind: "field", session: ranked }, ME).winner).toBeNull();
  });
});
