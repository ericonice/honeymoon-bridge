// @vitest-environment jsdom
import { newRubber, startDeal, summarizeField } from "@hb/engine";
import type {
  FieldResult,
  FieldState,
  MatchStanding,
  Pair,
  PlayerId,
  PlayerView,
} from "@hb/engine";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ContractBar } from "../src/ui/ContractBar.js";
import { DealComplete } from "../src/ui/DealComplete.js";

/**
 * What the screen between deals says at the end of a field session.
 *
 * Every one of these was reported from a real phone rather than caught here, which
 * is the reason the file exists: the format was new, and nothing rendered its
 * finishing screen at all — so it inherited a rubber's noun, a rubber's rating line
 * and the reveal's single-board pad, and all three were wrong in a way only playing
 * one would show.
 */

const ME: PlayerId = 0;
const view = { contract: null, me: ME, opponent: 1, phase: "complete" } as PlayerView;

function result(id: string, mine: number): FieldResult {
  return {
    board: { id, seed: 1, starter: 0, vulnerable: [false, false] },
    contract: { declarer: 0, doubling: "none", level: 4, strain: "S" },
    field: [
      {
        contract: { declarer: 0, doubling: "none", level: 3, strain: "H" },
        kind: "computer",
        points: 140,
        tricks: [9, 4],
        who: "Computer",
      },
    ],
    points: [mine, 0],
    tricks: [10, 3],
  };
}

function standingFor(results: readonly FieldResult[]): MatchStanding {
  const state: FieldState = {
    at: results.length,
    boards: results.map((one) => one.board),
    deal: startDeal({ seed: 1, starter: 0 }),
    me: ME,
    results,
  };
  return { kind: "field", summary: summarizeField(state) };
}

/** Everything `DealComplete` needs that is not the thing under test. */
function props(standing: MatchStanding, complete = true) {
  return {
      dealBonus: 0,
      format: "field" as const,
      halfComplete: false,
      matchComplete: complete,
      matchDetail: true,
      matchWinner: ME,
      onDone: () => {},
      onNextDeal: () => {},
      onPlaySameBoards: null,
      opponentName: "Computer",
      opponentRating: 1400,
      opponentWaitingToContinue: false,
      repeated: false,
      score: null,
      standing,
      view,
      vulnerable: [false, false] as Pair<boolean>,
      waitingToContinue: false,
  };
}

function finish(results: readonly FieldResult[], complete = true): string {
  render(createElement(DealComplete, props(standingFor(results), complete)));
  return document.body.textContent ?? "";
}

/** A rubber standing, for the one case that must still show a rating. */
function rubberStanding(): MatchStanding {
  return { history: [], kind: "rubber", previous: [], previousPoints: null, rubber: newRubber() };
}

/**
 * A rating this device already knows, because `ratingChange` returns null without
 * one — so a test asserting "no rating shown" passes against the bug it is meant to
 * catch unless the figure would otherwise have appeared. It did, on the first draft.
 */
function knowMyRating(): void {
  localStorage.setItem("hb.ratings", JSON.stringify({ mine: 1439, step: 18 }));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("the strip's deal row", () => {
  /**
   * The contract sits on the right of the row that already says which deal you are
   * on — in **every** format, since that row is shared. It has been in three other
   * places: inside the score proper, where it grew a row when play started and
   * pushed the board down; on the declarer's own seat label, which is deliberately
   * the quietest thing on the board; and in the top bar, which names the phase
   * everywhere else and should not mean two kinds of thing.
   */
  it("carries the contract in every format, not only a session", () => {
    for (const standing of [standingFor([result("b1", 620)]), rubberStanding()]) {
      cleanup();
      render(
        createElement(ContractBar, {
          density: "full" as const,
          format: standing.kind === "field" ? ("field" as const) : ("rubber" as const),
          handsPlayed: 1,
          onShowScore: null,
          opponentName: "Computer",
          phase: "play" as const,
          standing,
          view: {
            contract: { declarer: 0, doubling: "none", level: 4, strain: "S" },
            me: ME,
            opponent: 1,
            phase: "play",
            tricksWon: [0, 0],
          } as PlayerView,
        }),
      );
      expect(document.body.textContent ?? "").toContain("by you");
    }
  });

  /** Nothing to draw before there is one — and nothing appears, so nothing moves. */
  it("says nothing about a contract during the auction", () => {
    render(
      createElement(ContractBar, {
        density: "full" as const,
        format: "rubber" as const,
        handsPlayed: 1,
        onShowScore: null,
        opponentName: "Computer",
        phase: "auction" as const,
        standing: rubberStanding(),
        view: { contract: null, me: ME, opponent: 1, phase: "auction", tricksWon: [0, 0] } as PlayerView,
      }),
    );

    expect(document.body.textContent ?? "").not.toContain("by you");
  });
});

describe("finishing a field session", () => {
  const THREE = [result("b1", 620), result("b2", 100), result("b3", -50)];

  it("calls it a session rather than a rubber", () => {
    const shown = finish(THREE);

    expect(shown).toContain("session");
    expect(shown).not.toContain("rubber");
  });

  /**
   * §1.8a leaves rating open and the server excludes the format from the walk, so a
   * figure here is a number that never arrives. Worse, a session's stored points are
   * a matchpoint percentage and its complement rather than a total, so "beat the
   * computer" is not what the result says.
   */
  it("claims no rating change, since none is coming", () => {
    knowMyRating();

    expect(finish(THREE)).not.toContain("Rating");
  });

  /**
   * The anti-vacuity half: the same fixture in a format that *is* rated does show
   * the line. Without this, the assertion above passes whenever the figure happens
   * to be unavailable for some other reason — which is exactly how it passed against
   * the bug on the first attempt.
   */
  it("does show one for a format the server actually rates", () => {
    knowMyRating();
    render(
      createElement(DealComplete, {
        ...props(rubberStanding()),
        format: "rubber",
      }),
    );

    expect(document.body.textContent ?? "").toContain("Rating");
  });

  /** The question at the end is how the session went, and every board answers it. */
  it("shows every board once the session is over", () => {
    finish(THREE);

    expect(screen.getByRole("button", { name: /Board 1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Board 3/ })).toBeTruthy();
  });

  /**
   * Between deals it is the other way round: the reveal is about the hand that just
   * finished, and redrawing every earlier board under it buries that in a scroll.
   */
  it("shows only the board just played while the session is running", () => {
    finish(THREE, false);

    expect(screen.queryByRole("button", { name: /Board 1/ })).toBeNull();
  });
});
