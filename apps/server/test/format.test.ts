import { describe, expect, it } from "vitest";
import { formatFor } from "../src/matchFormat.js";
import type { Asked } from "../src/matchFormat.js";

const asked = (
  format: Asked["format"],
  deals = 10,
  order: Asked["order"] = "halves",
  halfFormat: Asked["halfFormat"] = "game",
): Asked => ({
  deals,
  format,
  halfFormat,
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

/**
 * **A disagreement always resolves, and that is the point of a total ordering.**
 *
 * Mirror, then a rubber or a game, then duplicate. The version this replaced made
 * duplicate and mirror take *both* seats and fall back to a rubber, which is sound at
 * an invite — two people who know each other can simply agree — and useless in a
 * queue, where somebody asking for a session either waited for a stranger who wanted
 * the same thing or was handed a rubber with nothing saying why. A rule that leaves
 * somebody waiting is worse here than one that hands them a neighbouring game.
 */
describe("resolving a disagreement about the format", () => {
  it("plays the higher-precedence of the two", () => {
    expect(formatFor(asked("mirror"), asked("rubber")).format).toBe("mirror");
    expect(formatFor(asked("rubber"), asked("mirror")).format).toBe("mirror");
    expect(formatFor(asked("mirror"), asked("duplicate")).format).toBe("mirror");
    expect(formatFor(asked("duplicate"), asked("mirror")).format).toBe("mirror");
  });

  /**
   * Duplicate is last because it is the format furthest from the game everyone else
   * came for, so in practice it still takes both seats — nothing outranks a seat that
   * did not ask for it.
   */
  it("never imposes duplicate on somebody who did not ask", () => {
    expect(formatFor(asked("duplicate"), asked("rubber")).format).toBe("rubber");
    expect(formatFor(asked("duplicate"), asked("game")).format).toBe("game");
    expect(formatFor(asked("duplicate"), asked("duplicate")).format).toBe("duplicate");
  });

  /**
   * **How long is a separate question from which game**, and it keeps the asymmetry
   * this has had from the start: the shorter always wins, because somebody held in a
   * rubber they did not agree to owes the better part of an hour where somebody who
   * wanted a rubber and gets a game can simply play another.
   */
  it("takes the shorter of the two lengths, whichever format won", () => {
    const bothLong = formatFor(
      asked("mirror", 10, "halves", "rubber"),
      asked("mirror", 10, "halves", "rubber"),
    );
    expect(bothLong.halfFormat).toBe("rubber");

    // One seat wants single-game halves: the shorter wins.
    expect(formatFor(asked("mirror", 10, "halves", "rubber"), asked("mirror")).halfFormat).toBe(
      "game",
    );
  });

  /**
   * The length is read off **both** seats whichever format won, because a client sends
   * every preference it holds rather than only the one matching its own choice. A seat
   * that asked for a rubber still has an opinion about how long a mirror's halves run.
   */
  it("asks the seat that did not choose the format how long it should be", () => {
    const agreed = formatFor(asked("rubber", 10, "halves", "game"), asked("mirror", 10, "halves", "rubber"));

    expect(agreed.format).toBe("mirror");
    expect(agreed.halfFormat).toBe("game");
  });
});
