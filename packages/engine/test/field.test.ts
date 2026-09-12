import { describe, expect, it } from "vitest";
import { legalActions } from "../src/deal.js";
import {
  applyFieldAction,
  currentFieldBoard,
  fieldMarginOf,
  nextFieldDeal,
  startField,
  summarizeField,
  withReference,
} from "../src/field.js";
import type { FieldBoard, FieldReference, FieldState } from "../src/field.js";
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

function reference(points: number, entries = 1): FieldReference {
  return { contract: null, entries, points, tricks: null };
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

describe("what a board is compared against", () => {
  /**
   * §1.8a: the history is fetched only once the deal is over, so a board that has
   * been played and not yet compared is a real state rather than an error — and it
   * must not read as a board worth nothing.
   */
  it("is worth nothing at all until the history arrives, rather than worth zero", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const summary = summarizeField(done);

    expect(summary.boardsCompared).toBe(0);
    expect(summary.margin).toBe(0);
    for (const result of summary.results) {
      expect(fieldMarginOf(result, ME, "points")).toBeNull();
    }
  });

  it("attaches a late reference to the board it belongs to", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const withOne = withReference(done, "b2", reference(120));
    const summary = summarizeField(withOne);

    expect(summary.boardsCompared).toBe(1);
    expect(summary.results.find((one) => one.board.id === "b2")?.reference?.points).toBe(120);
    expect(summary.results.find((one) => one.board.id === "b1")?.reference).toBeNull();
  });

  it("ignores a reference for a board this session is not playing", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));

    expect(withReference(done, "elsewhere", reference(120))).toBe(done);
  });

  it("takes the margin from this seat's own score", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const mine = summarizeField(done).results[0]!.points[ME];
    const compared = withReference(done, "b1", reference(mine - 300));

    expect(fieldMarginOf(summarizeField(compared).results[0]!, ME, "points")).toBe(300);
  });

  /**
   * `impsFor` takes a size, so a losing board converted through it would come back
   * positive — a sign this format cannot afford to lose, since the whole session is
   * the sum of signed board margins.
   */
  it("keeps the sign when the margin is converted to IMPs", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME, scoring: "imps" }));
    const mine = summarizeField(done).results[0]!.points[ME];
    const behind = withReference(done, "b1", reference(mine + 500));
    const ahead = withReference(done, "b1", reference(mine - 500));

    const lost = fieldMarginOf(summarizeField(behind).results[0]!, ME, "imps")!;
    const won = fieldMarginOf(summarizeField(ahead).results[0]!, ME, "imps")!;
    expect(lost).toBeLessThan(0);
    expect(won).toBe(-lost);
  });

  it("totals only the boards that have come back", () => {
    const done = playSession(startField({ boards: BOARDS, me: ME }));
    const results = summarizeField(done).results;
    const compared = withReference(
      withReference(done, "b1", reference(results[0]!.points[ME] - 100)),
      "b3",
      reference(results[2]!.points[ME] + 40),
    );
    const summary = summarizeField(compared);

    expect(summary.boardsCompared).toBe(2);
    expect(summary.boardsPlayed).toBe(3);
    expect(summary.margin).toBe(60);
  });
});
