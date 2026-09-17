// @vitest-environment jsdom
import { newRubber, startDeal, startDuplicate, summarizeDuplicate, summarizeField } from "@hb/engine";
import type {
  FieldResult,
  FieldState,
  MatchStanding,
  Pair,
  PlayerId,
  PlayerView,
} from "@hb/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    board: { ids: [id, null], seed: 1, starter: 0, vulnerable: [false, false] },
    contract: { declarer: 0, doubling: "none", level: 4, strain: "S" },
    field: [[
      {
        contract: { declarer: 0, doubling: "none", level: 3, strain: "H" },
        kind: "computer",
        points: 140,
        tricks: [9, 4],
        who: "Computer",
      },
    ], null],
    points: [mine, 0],
    tricks: [10, 3],
  };
}

function standingFor(results: readonly FieldResult[]): MatchStanding {
  const state: FieldState = {
    at: results.length,
    boards: results.map((one) => one.board),
    deal: startDeal({ seed: 1, starter: 0 }),
    results,
  };
  return { kind: "field", summary: summarizeField(state, ME) };
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

/**
 * A real Replay standing, built through the engine rather than as a fixture — the
 * question here is what a *format* is told, so the summary should be one the format
 * actually produces.
 */
function duplicateStanding(): MatchStanding {
  return {
    kind: "duplicate",
    summary: summarizeDuplicate(startDuplicate({ boards: 2, firstBoard: 1, minGap: 1, scheduleSeed: 1, starter: 0 })),
  };
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
          density: "normal" as const,
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
        density: "normal" as const,
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

  /**
   * **A finished session shows the whole session, with no tap to find.**
   *
   * Every other format's last screen is its entire pad — a rubber ends on its whole
   * scorepad — and this one ended on a single board with the result behind a link,
   * which made it the one format that asked for an extra tap to see how it went.
   * Reported as exactly that.
   *
   * The link is asserted *absent* rather than merely unused: leaving it would offer
   * what is already on screen, which is a control that does nothing.
   */
  it("shows the whole session as soon as it is over", () => {
    finish(THREE);

    expect(screen.getByRole("button", { name: /Board 1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Board 3/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /whole session/i })).toBeNull();
  });

  /**
   * **Every row shut, including the board just played.**
   *
   * That row opened on mount for a real reason — showing the whole session at the end
   * otherwise skipped the last board's own traveller, making it the one deal of the
   * sitting whose result you never saw. The reveal stages that traveller on its own
   * now, before this screen is reached, so opening it here drew the same thing twice in
   * consecutive screens.
   *
   * Asserted across two rows rather than one, so a pad that opened *every* row would
   * fail rather than pass on whichever row happened to be checked.
   */
  it("leaves every board shut, the last one included", () => {
    finish(THREE);

    for (const board of [1, 3]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`Board ${board}`) }).getAttribute("aria-expanded"),
      ).toBe("false");
    }
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

/**
 * **What a passed-out board is told it means, per format.**
 *
 * A rubber throws a passed-out deal in and redeals it with the same player drawing
 * first. **Neither board format does**: `nextFieldDeal` and a session's schedule both
 * advance unconditionally, so the board is spent and the pass is the result. Doop was
 * being shown the rubber sentence, because the branch read "duplicate, or else the
 * rubber one" — the fourth time a conditional of that shape has swallowed this format.
 *
 * Keyed on the standing kind rather than asserting one string, so the guard is against
 * a *format* falling through rather than against a particular wording.
 */
describe("passing a board out", () => {
  const REDEAL = /thrown in and redealt/;

  function passedOut(standing: MatchStanding): string {
    render(
      createElement(DealComplete, {
        ...props(standing, false),
        view: { ...view, passedOut: true } as PlayerView,
      }),
    );
    return document.body.textContent ?? "";
  }

  it("never promises a redeal in either board format", () => {
    for (const standing of [standingFor([result("b1", 0)]), duplicateStanding()]) {
      cleanup();
      const shown = passedOut(standing);
      expect(shown).toContain("Passed out");
      expect(shown).toContain("not redealt");
      expect(shown).not.toMatch(REDEAL);
    }
  });

  /**
   * The anti-vacuity half: a rubber really does redeal, so the sentence has to still
   * exist. Without this, deleting it altogether would pass the assertions above.
   */
  it("still promises one in a rubber, which really does redeal", () => {
    expect(passedOut(rubberStanding())).toMatch(REDEAL);
  });

  /**
   * Doop says what it costs rather than only what it is. A passed-out board there is
   * not a private zero — §1.8a ranks it against everybody who bid something on the
   * same cards.
   */
  it("tells a Doop board it is still ranked", () => {
    expect(passedOut(standingFor([result("b1", 0)]))).toContain("ranked against");
  });
});
