// @vitest-environment jsdom
import type { Contract, PlayerView } from "@hb/engine";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TopBar } from "../src/ui/TopBar.js";

/**
 * The headline during play, which is the contract rather than the word "Play".
 *
 * Worth a test because the contract has now lived in three places, and the reason it
 * moved each time was invisible to a screenshot: the score strip grew a row mid-deal,
 * and the seat label is deliberately the quietest thing on the board. The headline is
 * the one spot that is both the most prominent text on screen and free — the word it
 * replaces tells a reader nothing.
 */

const FOUR_SPADES: Contract = { declarer: 0, doubling: "none", level: 4, strain: "S" };

function show(phase: PlayerView["phase"], contract: Contract | null, me = 0): string {
  render(
    createElement(TopBar, {
      onLeave: null,
      onShowSettings: () => {},
      onSkipPhase: null,
      opponentName: "Computer",
      phase,
      view: { contract, me, opponent: me === 0 ? 1 : 0, phase } as PlayerView,
    }),
  );
  return screen.getByRole("heading").textContent ?? "";
}

afterEach(cleanup);

describe("what the top bar says", () => {
  it("names the phase before there is a contract", () => {
    expect(show("draw", null)).toBe("Draw");
    cleanup();
    expect(show("auction", null)).toBe("Auction");
  });

  it("names the contract during play, and whose it is", () => {
    expect(show("play", FOUR_SPADES)).toContain("by you");
    cleanup();
    expect(show("play", { ...FOUR_SPADES, declarer: 1 })).toContain("by Computer");
  });

  /** "Play" told a reader nothing they did not know, which is why the spot was free. */
  it("stops saying Play once there is something better to say", () => {
    expect(show("play", FOUR_SPADES)).not.toContain("Play");
  });

  /**
   * A passed-out deal reaches play with no contract and goes straight on, so the
   * phase word is still the honest answer for the beat that lasts.
   */
  it("falls back to the phase for a deal nobody bought", () => {
    expect(show("play", null)).toBe("Play");
  });

  it("still says the deal is over once it is", () => {
    expect(show("complete", FOUR_SPADES)).toBe("Deal complete");
  });
});
