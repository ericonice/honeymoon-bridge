import { describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";
import { fieldReferenceFor, fieldResultFrom } from "../src/field.js";

/**
 * A database that answers a queued list of results in order.
 *
 * `fieldReferenceFor` makes exactly two queries — does the asker have a result here,
 * then what everybody else got — so a queue says which is which without this having
 * to read SQL. **It deliberately cannot check a `WHERE` clause**, which is the same
 * limit `ratings.test.ts` states about its own stub: the exclusion of the asker's
 * own row and the board selection are SQL, and they are checked against real local
 * D1 rather than here.
 */
function env(answers: readonly unknown[]): { readonly env: Env; readonly asked: string[] } {
  const queue = [...answers];
  const asked: string[] = [];
  return {
    asked,
    env: {
      DB: {
        prepare: (sql: string) => {
          asked.push(sql);
          const answer = queue.shift();
          return {
            bind: () => ({
              first: () => Promise.resolve(answer ?? null),
              all: () => Promise.resolve({ results: answer ?? [] }),
            }),
          };
        },
      },
    } as unknown as Env,
  };
}

function entry(points: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    points,
    declarer: 0,
    contract_level: 3,
    contract_strain: "H",
    contract_doubling: "none",
    tricks_0: 9,
    tricks_1: 4,
    ...over,
  };
}

describe("reading a reported field result", () => {
  it("takes a whole report", () => {
    expect(
      fieldResultFrom({
        boardId: "b1",
        contract: { declarer: 1, doubling: "doubled", level: 4, strain: "S" },
        points: 620,
        tricks: [3, 10],
      }),
    ).toEqual({
      boardId: "b1",
      contract: { declarer: 1, doubling: "doubled", level: 4, strain: "S" },
      points: 620,
      tricks: [3, 10],
    });
  });

  /**
   * A passed-out deal is a real result — and usually a bad one, since solid play
   * rarely passes a board out. It has to be told apart from a *malformed* contract,
   * which is why the parser answers with three states rather than two.
   */
  it("takes a passed-out board, which has no contract and is still a result", () => {
    const parsed = fieldResultFrom({ boardId: "b1", contract: null, points: 0, tricks: [7, 6] });

    expect(parsed?.contract).toBeNull();
    expect(parsed?.points).toBe(0);
  });

  it("refuses a contract that is there and is wrong", () => {
    expect(
      fieldResultFrom({
        boardId: "b1",
        contract: { declarer: 3, doubling: "none", level: 4, strain: "S" },
        points: 620,
        tricks: [3, 10],
      }),
    ).toBeNull();
  });

  it("refuses a report with no score, rather than storing it as nothing", () => {
    expect(fieldResultFrom({ boardId: "b1", contract: null, tricks: [7, 6] })).toBeNull();
  });

  it("refuses anything that is not a report at all", () => {
    for (const body of [null, "b1", 7, {}, { boardId: "" }]) {
      expect(fieldResultFrom(body)).toBeNull();
    }
  });
});

describe("what a board has been worth", () => {
  /**
   * §1.8a: the comparison is not available until the board has been played. Checked
   * here as *not asking the second question at all* rather than as a null return —
   * a version that fetched the history and then declined to send it would pass a
   * weaker test and would still have read the answer.
   */
  it("says nothing, and looks nothing up, until the asker has played the board", async () => {
    const { env: stub, asked } = env([null]);

    expect(await fieldReferenceFor(stub, "b1", "ada")).toBeNull();
    expect(asked).toHaveLength(1);
  });

  it("averages every recorded result", async () => {
    const { env: stub } = env([{ 1: 1 }, [entry(140), entry(200), entry(-100)]]);
    const reference = await fieldReferenceFor(stub, "b1", "ada");

    expect(reference?.entries).toBe(3);
    expect(reference?.points).toBe(80);
  });

  /** A yardstick with a fraction in it puts every board that fraction off zero. */
  it("rounds the average, since it is compared against whole scores", async () => {
    const { env: stub } = env([{ 1: 1 }, [entry(100), entry(151)]]);

    expect((await fieldReferenceFor(stub, "b1", "ada"))?.points).toBe(126);
  });

  /**
   * An average has no contract, so the one shown is a real recorded deal — the
   * earliest — rather than anything derived. Inventing a contract for the mean would
   * put a figure on screen that nothing played.
   */
  it("shows one recorded contract rather than one belonging to the average", async () => {
    const { env: stub } = env([
      { 1: 1 },
      [entry(140), entry(620, { contract_level: 4, contract_strain: "S", declarer: 1 })],
    ]);
    const reference = await fieldReferenceFor(stub, "b1", "ada");

    expect(reference?.contract).toEqual({
      declarer: 0,
      doubling: "none",
      level: 3,
      strain: "H",
    });
    expect(reference?.tricks).toEqual([9, 4]);
  });

  it("reads a passed-out recorded deal as no contract rather than as a broken one", async () => {
    const { env: stub } = env([
      { 1: 1 },
      [entry(0, { contract_level: null, contract_strain: null, declarer: null })],
    ]);

    expect((await fieldReferenceFor(stub, "b1", "ada"))?.contract).toBeNull();
  });

  /**
   * A board whose only result is the asker's own has nothing to compare against, so
   * it is blank rather than a margin of zero — the distinction the pad draws between
   * a board played and not yet compared and a board worth nothing.
   */
  it("says nothing when the asker's own result is the only one", async () => {
    const { env: stub } = env([{ 1: 1 }, []]);

    expect(await fieldReferenceFor(stub, "b1", "ada")).toBeNull();
  });
});
