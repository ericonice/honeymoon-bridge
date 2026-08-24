// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { DIFFICULTIES } from "../src/bot/difficulty.js";
import { botAnchor, knownRatings, rememberRatings, STARTING_RATING } from "../src/game/records.js";
import type { Records } from "../src/game/records.js";

/**
 * The anchors are the server's to decide, and this is about the client never
 * inventing one.
 *
 * A rating is the number somebody quotes at the dinner table, so a plausible
 * guess is worse than a blank: nobody checks a number that looks right. The rung
 * ladder is also provisional and will be re-spaced, which makes any local copy of
 * it wrong in exactly the way that matters.
 */

function recordsWith(anchors: Records["anchors"]): Records {
  return {
    ...(anchors === undefined ? {} : { anchors }),
    opponents: [],
    rating: { history: [], played: 0, value: STARTING_RATING },
    robot: [],
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("what the computer is rated on a rung", () => {
  test("is nothing at all until a record has been fetched", () => {
    expect(botAnchor(3, "championship")).toBeNull();
  });

  test("is the number the server sent for that release and that rung", () => {
    rememberRatings(recordsWith({ "2": { championship: 1200 }, "3": { championship: 1250, kitchen: 950 } }));
    expect(botAnchor(3, "championship")).toBe(1250);
    expect(botAnchor(3, "kitchen")).toBe(950);
    expect(botAnchor(2, "championship")).toBe(1200);
  });

  test("survives the trip through storage, which is where it is read from", () => {
    rememberRatings(recordsWith({ "3": { tournament: 1175 } }));
    expect(knownRatings().anchors["3"]?.tournament).toBe(1175);
  });

  /**
   * A server too old to send anchors still has a record worth showing, and the
   * robot row's own rating is the nearest true thing available — it describes
   * whichever rung was played last rather than the one being asked about, which
   * is why it is a fallback and not the answer.
   */
  test("falls back to the last match's rating from a server too old to send anchors", () => {
    rememberRatings({
      opponents: [],
      rating: { history: [], played: 0, value: STARTING_RATING },
      robot: [{ rating: 1200 } as Records["robot"][number]],
    });
    expect(botAnchor(3, "championship")).toBe(1200);
  });

  test("a release the server has no anchor for shows nothing rather than a neighbour's", () => {
    rememberRatings(recordsWith({ "3": { championship: 1250 } }));
    expect(botAnchor(4, "championship")).toBeNull();
  });

  test("a rung the server has no anchor for shows nothing rather than the release's", () => {
    rememberRatings(recordsWith({ "3": { championship: 1250 } }));
    for (const rung of DIFFICULTIES.filter((one) => one !== "championship")) {
      expect(botAnchor(3, rung)).toBeNull();
    }
  });
});
