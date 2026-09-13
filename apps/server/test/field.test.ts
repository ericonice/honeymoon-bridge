import { describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";
import { fieldFor, fieldResultFrom } from "../src/field.js";

/**
 * A database that answers a queued list of results in order.
 *
 * `fieldFor` makes exactly two queries — does the asker have a result here,
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
    generated: 1,
    opponent_account_id: null,
    who: null,
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

describe("the field a board carries", () => {
  /**
   * §1.8a: the field is not available until the board has been played. Checked as
   * *not asking the second question at all* rather than as a null return — a version
   * that fetched the rows and then declined to send them would pass a weaker test
   * and would still have read the answer.
   */
  it("says nothing, and looks nothing up, until the asker has played the board", async () => {
    const { env: stub, asked } = env([null]);

    expect(await fieldFor(stub, "b1", "ada")).toBeNull();
    expect(asked).toHaveLength(1);
  });

  it("returns every other result whole, rather than an average of them", async () => {
    const { env: stub } = env([{ 1: 1 }, [entry(140), entry(200), entry(-100)]]);
    const field = await fieldFor(stub, "b1", "ada");

    expect(field?.map((one) => one.points)).toEqual([140, 200, -100]);
    expect(field?.[0]?.contract).toEqual({
      declarer: 0,
      doubling: "none",
      level: 3,
      strain: "H",
    });
  });

  /**
   * The three kinds of §1.8a, derived rather than stored: a generated row has no
   * account, and a table result is one recorded with somebody opposite.
   */
  it("says who played whom", async () => {
    const { env: stub } = env([
      { 1: 1 },
      [
        entry(140, { generated: 1 }),
        entry(200, { generated: 0, who: "Noah" }),
        entry(300, { generated: 0, who: "Kate", opponent_account_id: "ada" }),
      ],
    ]);
    const field = await fieldFor(stub, "b1", "ada");

    expect(field?.map((one) => one.kind)).toEqual(["computer", "solo", "table"]);
    expect(field?.map((one) => one.who)).toEqual(["Computer", "Noah", "Kate"]);
  });

  /** A real row belonging to somebody who has not named themselves still has to draw. */
  it("names a nameless player rather than leaving the row blank", async () => {
    const { env: stub } = env([{ 1: 1 }, [entry(200, { generated: 0, who: null })]]);

    expect((await fieldFor(stub, "b1", "ada"))?.[0]?.who).toBe("A player");
  });

  it("reads a passed-out recorded deal as no contract rather than as a broken one", async () => {
    const { env: stub } = env([
      { 1: 1 },
      [entry(0, { contract_level: null, contract_strain: null, declarer: null })],
    ]);

    expect((await fieldFor(stub, "b1", "ada"))?.[0]?.contract).toBeNull();
  });

  /**
   * A board whose only result is the asker's own has nobody to rank against, so it
   * comes back empty — which the engine reads as unranked rather than as last.
   */
  it("comes back empty when the asker's own result is the only one", async () => {
    const { env: stub } = env([{ 1: 1 }, []]);

    expect(await fieldFor(stub, "b1", "ada")).toEqual([]);
  });
});
