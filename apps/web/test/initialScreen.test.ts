// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initialScreen } from "../src/App.js";
import { saveRobotMatch } from "../src/game/robotPersistence.js";

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
});

afterEach(() => {
  window.location.hash = "";
  localStorage.clear();
});

/**
 * More than one of these can be true of a real launch at once, and the
 * precedence is what decides which one wins — see `initialScreen`'s own doc.
 */
describe("where a launch lands", () => {
  it("goes home with nothing in the address bar and nothing saved", () => {
    expect(initialScreen()).toEqual({ kind: "home" });
  });

  it("goes to the saved robot match when there is one and nothing in the address bar", () => {
    saveRobotMatch({
      boardOffers: [],
      dealSeed: 1,
      match: { kind: "duplicate" } as never,
      reported: false,
      rung: "club",
      version: 2,
    });

    expect(initialScreen()).toEqual({ kind: "robot" });
  });

  it("an invite in the address bar wins over a saved robot match", () => {
    saveRobotMatch({
      boardOffers: [],
      dealSeed: 1,
      match: { kind: "duplicate" } as never,
      reported: false,
      rung: "club",
      version: 2,
    });
    window.location.hash = "#/table/ABCDEF";

    expect(initialScreen()).toEqual({ code: "ABCDEF", kind: "table", role: "guest" });
  });

  it("a sign-in link wins, whatever else is in the address bar", () => {
    window.location.hash = "#/signin/tok123?to=queue";

    expect(initialScreen()).toEqual({ kind: "redeem", to: { kind: "queue" }, token: "tok123" });
  });

  it("a sign-in link with no destination redeems toward home", () => {
    window.location.hash = "#/signin/tok123";

    expect(initialScreen()).toEqual({ kind: "redeem", to: null, token: "tok123" });
  });
});
