import { describe, expect, it } from "vitest";
import { formatFor } from "../src/matchFormat.js";

describe("agreeing how long the sitting is", () => {
  it("plays a rubber only when both want one", () => {
    expect(formatFor("rubber", "rubber")).toBe("rubber");
  });

  it("plays a single game if either player wants one", () => {
    // Deliberately not symmetric. Somebody who wanted one game and is held in a
    // rubber owes the better part of an hour they did not agree to; somebody who
    // wanted a rubber and gets a game can simply play another.
    expect(formatFor("game", "rubber")).toBe("game");
    expect(formatFor("rubber", "game")).toBe("game");
    expect(formatFor("game", "game")).toBe("game");
  });
});
