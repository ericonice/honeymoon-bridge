// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  clearRobotMatch,
  hasSavedRobotMatch,
  loadRobotMatch,
  saveRobotMatch,
} from "../src/game/robotPersistence.js";

afterEach(() => {
  localStorage.clear();
});

const SNAPSHOT = {
  boardOffers: [] as const,
  dealSeed: 12,
  match: { kind: "duplicate" } as unknown as import("@hb/engine").MatchState,
  reported: false,
  rung: "club" as const,
  version: 3,
};

describe("the saved robot match", () => {
  it("says nothing is saved before anything is", () => {
    expect(hasSavedRobotMatch()).toBe(false);
    expect(loadRobotMatch()).toBeNull();
  });

  it("round-trips exactly what was saved", () => {
    saveRobotMatch(SNAPSHOT);
    expect(hasSavedRobotMatch()).toBe(true);
    expect(loadRobotMatch()).toEqual(SNAPSHOT);
  });

  it("is gone once cleared", () => {
    saveRobotMatch(SNAPSHOT);
    clearRobotMatch();
    expect(hasSavedRobotMatch()).toBe(false);
    expect(loadRobotMatch()).toBeNull();
  });

  it("clearing what was never saved is not an error", () => {
    expect(() => {
      clearRobotMatch();
    }).not.toThrow();
  });

  /**
   * A stale or hand-edited value must never crash the app it was meant to
   * save time in — the caller is what decides whether the parsed shape
   * actually works, not this module.
   */
  it("reads back whatever JSON was there, without validating its shape", () => {
    localStorage.setItem("hb.robotMatch", "not json at all");
    expect(() => loadRobotMatch()).not.toThrow();
    expect(loadRobotMatch()).toBeNull();
  });
});
