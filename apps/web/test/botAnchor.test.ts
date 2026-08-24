// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DIFFICULTIES } from "../src/bot/difficulty.js";
import {
  botAnchor,
  knownRatings,
  rememberRatings,
  STARTING_RATING,
  useBotAnchor,
} from "../src/game/records.js";
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

describe("fetching the anchor when nothing local says", () => {
  /**
   * The bug this pins: the anchors used to arrive only with the record, so the
   * rating beside the opponent's seat was blank until you had visited a
   * different screen while signed in. A number whose job is to sit beside the
   * opponent while you play them must not be reachable only from elsewhere.
   */
  function Probe({ onRead }: { readonly onRead: (value: number | null) => void }): null {
    onRead(useBotAnchor(3, "championship"));
    return null;
  }

  function readings(): number[] {
    const seen: (number | null)[] = [];
    render(createElement(Probe, { onRead: (value) => seen.push(value) }));
    return seen.filter((one): one is number => one !== null);
  }

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("does not ask the server when the answer is already cached", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    rememberRatings(recordsWith({ "3": { championship: 1400 } }));

    expect(readings()).toContain(1400);
    expect(fetched).not.toHaveBeenCalled();
  });

  test("asks once when nothing is cached, and shows what comes back", async () => {
    const fetched = vi.fn(async () => ({
      json: async () => ({ anchors: { "3": { championship: 1400 } } }),
      ok: true,
    }));
    vi.stubGlobal("fetch", fetched as unknown as typeof globalThis.fetch);

    const seen: (number | null)[] = [];
    await act(async () => {
      render(createElement(Probe, { onRead: (value) => seen.push(value) }));
    });

    expect(fetched).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBe(1400);
  });

  /** Offline is the robot game's normal state. A blank, never a guess. */
  test("stays blank when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof globalThis.fetch,
    );

    const seen: (number | null)[] = [];
    await act(async () => {
      render(createElement(Probe, { onRead: (value) => seen.push(value) }));
    });

    expect(seen.every((one) => one === null)).toBe(true);
  });
});
