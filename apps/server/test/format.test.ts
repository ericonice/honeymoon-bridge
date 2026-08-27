import { describe, expect, it } from "vitest";
import { formatFor } from "../src/matchFormat.js";
import type { Asked } from "../src/matchFormat.js";

const asked = (format: Asked["format"], deals = 10, order: Asked["order"] = "halves"): Asked => ({
  deals,
  format,
  order,
});

describe("agreeing what the sitting plays", () => {
  it("plays a rubber only when both want one", () => {
    expect(formatFor(asked("rubber"), asked("rubber")).format).toBe("rubber");
  });

  it("plays a single game if either player wants one", () => {
    // Deliberately not symmetric. Somebody who wanted one game and is held in a
    // rubber owes the better part of an hour they did not agree to; somebody who
    // wanted a rubber and gets a game can simply play another.
    expect(formatFor(asked("game"), asked("rubber")).format).toBe("game");
    expect(formatFor(asked("rubber"), asked("game")).format).toBe("game");
    expect(formatFor(asked("game"), asked("game")).format).toBe("game");
  });

  /**
   * **Duplicate takes both, and that is a different rule from "shorter wins".**
   *
   * A rubber and a single game differ only in length, so there is a shorter one.
   * Duplicate is not shorter or longer but a different game — the deck repeats, the
   * score is one signed number a deal, half the boards are ones you have seen — so
   * the same asymmetry argument points the other way: being put into a format you
   * have never played and did not ask for is a worse mistake than getting the rubber
   * you know.
   */
  it("plays duplicate only when both ask for it", () => {
    expect(formatFor(asked("duplicate"), asked("duplicate")).format).toBe("duplicate");
    expect(formatFor(asked("duplicate"), asked("rubber")).format).toBe("rubber");
    expect(formatFor(asked("rubber"), asked("duplicate")).format).toBe("rubber");
  });

  /**
   * A seat that asked for duplicate and did not get it falls back to a rubber, and
   * does not get to impose a single game on somebody who asked for a rubber — having
   * asked for neither.
   */
  it("falls back to a rubber rather than to the shortest thing available", () => {
    expect(formatFor(asked("duplicate"), asked("rubber")).format).toBe("rubber");
    // But a seat that really did ask for one game still gets it.
    expect(formatFor(asked("duplicate"), asked("game")).format).toBe("game");
  });

  it("plays the shorter session when both want duplicate", () => {
    // Two boards from four deals, for the reason one game beats a rubber.
    expect(formatFor(asked("duplicate", 4), asked("duplicate", 10)).boards).toBe(2);
    expect(formatFor(asked("duplicate", 10), asked("duplicate", 2)).boards).toBe(1);
  });

  it("has no boards to agree on for anything but duplicate", () => {
    expect(formatFor(asked("rubber"), asked("game")).boards).toBe(0);
  });
});

/**
 * The order takes agreement, on the same reasoning duplicate itself does.
 *
 * Back to back and shuffled are different games rather than a longer and a shorter
 * one, so there is no "shorter wins" to appeal to — and being handed an order you did
 * not ask for is the mistake worth avoiding. A disagreement falls back to `halves`,
 * which is what a duplicate evening is and the default nobody has to have asked for.
 */
describe("agreeing how a session is ordered", () => {
  it("plays the order both asked for", () => {
    expect(formatFor(asked("duplicate", 10, "adjacent"), asked("duplicate", 10, "adjacent")).order).toBe(
      "adjacent",
    );
    expect(formatFor(asked("duplicate", 10, "random"), asked("duplicate", 10, "random")).order).toBe(
      "random",
    );
  });

  it("falls back to halves when they disagree", () => {
    expect(formatFor(asked("duplicate", 10, "adjacent"), asked("duplicate", 10, "random")).order).toBe(
      "halves",
    );
  });

  it("agrees the order and the length independently", () => {
    const agreed = formatFor(asked("duplicate", 4, "adjacent"), asked("duplicate", 10, "adjacent"));
    expect(agreed.boards).toBe(2);
    expect(agreed.order).toBe("adjacent");
  });
});
