// @vitest-environment jsdom
import { startMatch, summarizeMatch } from "@hb/engine";
import { afterEach, describe, expect, it } from "vitest";
import { startingPoint } from "../src/game/localSession.js";
import { saveRobotMatch } from "../src/game/robotPersistence.js";

afterEach(() => {
  localStorage.clear();
});

const REAL_MATCH = startMatch({
  firstBoard: 1,
  format: "rubber",
  halfFormat: "rubber",
  seed: 42,
  starter: 0,
});

describe("resolving where a robot match starts from", () => {
  it("deals a fresh match when nothing is saved", () => {
    const resolved = startingPoint();
    expect(resolved.boardOffers.size).toBe(0);
    expect(resolved.reportedAlready).toBe(false);
    // A fresh match has been dealt, not merely constructed — it has a deal to play.
    expect(summarizeMatch(resolved.match).format).toBeTruthy();
  });

  it("restores exactly the saved match, pinned release and rung", () => {
    saveRobotMatch({
      boardOffers: [],
      dealSeed: 7,
      match: REAL_MATCH,
      reported: false,
      rung: "kitchen",
      version: 2,
    });

    const resolved = startingPoint();
    expect(resolved.match).toEqual(REAL_MATCH);
    expect(resolved.dealSeed).toBe(7);
    expect(resolved.rung).toBe("kitchen");
    expect(resolved.version).toBe(2);
    expect(resolved.reportedAlready).toBe(false);
  });

  it("restores the board memory as a real Map, not an array of entries", () => {
    saveRobotMatch({
      boardOffers: [[3, { pairs: [], result: { contract: null, declared: false, tricksWon: [0, 0] } }]],
      dealSeed: 7,
      match: REAL_MATCH,
      reported: false,
      rung: "club",
      version: 2,
    });

    const resolved = startingPoint();
    expect(resolved.boardOffers).toBeInstanceOf(Map);
    expect(resolved.boardOffers.has(3)).toBe(true);
  });

  it("carries a saved 'already reported' flag through rather than resetting it", () => {
    saveRobotMatch({
      boardOffers: [],
      dealSeed: 7,
      match: REAL_MATCH,
      reported: true,
      rung: "club",
      version: 2,
    });

    expect(startingPoint().reportedAlready).toBe(true);
  });

  /**
   * A stale or foreign snapshot must fall back to a fresh rubber rather than
   * crash the app it was meant to save time in — checked against something
   * that actually reaches the `try`, not just malformed JSON, which
   * `robotPersistence`'s own test already covers.
   */
  it("falls back to a fresh match when the saved one does not actually work", () => {
    saveRobotMatch({
      boardOffers: [],
      dealSeed: 7,
      match: { kind: "not-a-real-format" } as never,
      reported: false,
      rung: "club",
      version: 2,
    });

    const resolved = startingPoint();
    expect(resolved.match).not.toEqual({ kind: "not-a-real-format" });
    expect(summarizeMatch(resolved.match).format).toBeTruthy();
  });

  it("falls back to a real difficulty when the saved rung names none", () => {
    saveRobotMatch({
      boardOffers: [],
      dealSeed: 7,
      match: REAL_MATCH,
      reported: false,
      rung: "grandmaster" as never,
      version: 2,
    });

    expect(["kitchen", "club", "championship"]).toContain(startingPoint().rung);
  });
});
