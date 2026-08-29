import { applyDealScore, newRubber, scoreDeal } from "@hb/engine";
import type { Card, Contract, Level, Pair, PlayerId, RubberState, Strain } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { expectedValue, objectiveFor } from "../src/bot/bidValue.js";
import type { Objective } from "../src/bot/bidValue.js";
import type { Standing } from "../src/bot/types.js";

const ME: PlayerId = 0;

function contract(level: Level, strain: Strain, declarer: PlayerId = ME): Contract {
  return { declarer, doubling: "none", level, strain };
}

/** A rubber where this seat has a game in hand, reached the way the engine reaches one. */
function gameInHand(): RubberState {
  return applyDealScore(
    newRubber("rubber"),
    scoreDeal(
      {
        contract: contract(4, "S"),
        hands: [[], []] as unknown as Pair<readonly Card[]>,
        tricksWon: [10, 3],
      },
      [false, false],
    ),
  );
}

/** The one standing a duplicate board can be in, on the boards that are not vulnerable. */
const LOVE_ALL: Standing = { rubber: newRubber("rubber"), vulnerable: [false, false] };

function value(
  bid: Contract,
  estimate: number,
  standing: Standing,
  objective: Objective,
): number {
  return expectedValue({
    contract: bid,
    estimate,
    exposedToDouble: true,
    gameEquity: 400,
    hand: [],
    me: ME,
    objective,
    standing,
  });
}

describe("pricing a call for a duplicate session", () => {
  /**
   * The property that separates this objective from the other two, and the whole
   * reason it has to exist: **a session has no standing.** Games won and a
   * part-score carried are what the other two price, and neither exists here — a
   * board is settled where it is played.
   *
   * Vulnerability is held equal on purpose, and the distinction is worth stating
   * because the first version of this test got it wrong: duplicate *does* have
   * vulnerability, prescribed per board rather than earned, and it changes the
   * score. What must not matter is the rest of the rubber.
   */
  it("ignores the rubber standing, since a session does not have one", () => {
    const bid = contract(4, "H");
    const love = value(bid, 10, { rubber: newRubber("rubber"), vulnerable: [false, false] }, "duplicate");
    const ahead = value(bid, 10, { rubber: gameInHand(), vulnerable: [false, false] }, "duplicate");

    expect(ahead).toBe(love);
  });

  /** The control on that: the points objective moves a long way, so the test above bites. */
  it("is the only one of the three that ignores it", () => {
    const bid = contract(4, "H");
    const love = value(bid, 10, { rubber: newRubber("rubber"), vulnerable: [false, false] }, "points");
    const ahead = value(bid, 10, { rubber: gameInHand(), vulnerable: [false, false] }, "points");

    expect(ahead).not.toBe(love);
  });

  /** And vulnerability, which a board really does carry, is priced. */
  it("prices vulnerability, which a board prescribes even though nobody earned it", () => {
    const bid = contract(4, "H");
    const flat = value(bid, 10, { rubber: newRubber("rubber"), vulnerable: [false, false] }, "duplicate");
    const exposed = value(bid, 10, { rubber: newRubber("rubber"), vulnerable: [true, false] }, "duplicate");

    expect(exposed).not.toBe(flat);
  });

  /**
   * The bidding this format is supposed to produce. Ten tricks in hearts is 170 in
   * a part-score and 420 as a game, so the game is worth bidding — and there is no
   * part-score to protect and no rubber to bank it toward, which is what makes the
   * arithmetic the whole of the argument.
   */
  it("prefers the game to the part-score that takes the same tricks", () => {
    const game = value(contract(4, "H"), 10, LOVE_ALL, "duplicate");
    const partScore = value(contract(3, "H"), 10, LOVE_ALL, "duplicate");

    expect(game).toBeGreaterThan(partScore);
  });

  /** And it still declines to overreach, since a failed contract pays no bonus at all. */
  it("does not stretch to a contract the hand cannot make", () => {
    const game = value(contract(4, "H"), 10, LOVE_ALL, "duplicate");
    const tooHigh = value(contract(6, "H"), 10, LOVE_ALL, "duplicate");

    expect(tooHigh).toBeLessThan(game);
  });

  it("prices defending a contract it cannot beat as a loss", () => {
    expect(value(contract(4, "H", 1), 10, LOVE_ALL, "duplicate")).toBeLessThan(0);
  });
});

describe("which objective a format is played for", () => {
  /**
   * The format wins, and only for duplicate. This exists as a function because the
   * app and the bench both have to answer it the same way — a single-game match was
   * once played by one bidder and recorded as another, for want of exactly this.
   */
  it("overrides the release's objective for a duplicate session", () => {
    expect(objectiveFor("duplicate", "equity")).toBe("duplicate");
    expect(objectiveFor("duplicate", "points")).toBe("duplicate");
  });

  it("overrides it for a two-game match as well", () => {
    expect(objectiveFor("mirror", "equity")).toBe("mirror");
    expect(objectiveFor("mirror", "points")).toBe("mirror");
  });

  it("leaves the formats that really are one rubber to the release", () => {
    expect(objectiveFor("rubber", "equity")).toBe("equity");
    expect(objectiveFor("game", "equity")).toBe("equity");
    expect(objectiveFor("rubber", "points")).toBe("points");
  });
});
