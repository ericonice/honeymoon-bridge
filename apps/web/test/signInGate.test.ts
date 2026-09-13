import { describe, expect, it } from "vitest";
import { gateFor } from "../src/App.js";
import type { Screen } from "../src/App.js";

/**
 * What needs an account, and where somebody lands afterwards.
 *
 * Its own test because the rule is a *precedence* inlined at one call site
 * otherwise, which is the shape `botTuning.ts` was extracted for: a decision made
 * inside a component cannot be asked a question. It also has two unrelated reasons
 * in it now — §3.7 gates playing a person, and §1.8a gates a field session because
 * boards are chosen by what this account has already met — so "which screens need
 * one" is no longer a single sentence anybody can hold in their head.
 */

const HOME_SCREEN: Screen = { kind: "home" };
const ROBOT: Screen = { kind: "robot" };

describe("what needs an account", () => {
  it("lets a rubber against the computer be played by anybody", () => {
    expect(gateFor(ROBOT, "rubber")).toBeNull();
    expect(gateFor(ROBOT, "game")).toBeNull();
  });

  /**
   * Replay is a session against the computer and nothing about it leaves this
   * device, so it is not gated. Field is, and the difference is the corpus rather
   * than the format being a session.
   */
  it("lets a replay session be played by anybody", () => {
    expect(gateFor(ROBOT, "duplicate")).toBeNull();
  });

  it("asks a field session for one, and brings you back to the game", () => {
    expect(gateFor(ROBOT, "field")).toEqual({ kind: "robot" });
  });

  it("asks anybody meeting a person for one", () => {
    expect(gateFor({ kind: "searching" }, "rubber")).toEqual({ kind: "queue" });
    expect(gateFor({ code: "ABCD", kind: "table", role: null }, "rubber")).toEqual({
      code: "ABCD",
      kind: "table",
    });
  });

  /**
   * The format must not gate a screen that is not a match. Choosing Field and then
   * opening the record would otherwise demand a sign-in to read your own record.
   */
  it("does not ask on a screen that is not a game, whatever format is chosen", () => {
    for (const screen of [HOME_SCREEN, { kind: "record" } as Screen, { kind: "achievements" } as Screen]) {
      expect(gateFor(screen, "field")).toBeNull();
    }
  });
});
