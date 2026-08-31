// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { newRubber } from "@hb/engine";
import type { MatchFormat, MatchStanding, Pair, PlayerId, PlayerView } from "@hb/engine";
import { afterEach, describe, expect, it } from "vitest";
import { ContractBar } from "../src/ui/ContractBar.js";
import { DealComplete } from "../src/ui/DealComplete.js";
import { SeatLabel } from "../src/ui/SeatLabel.js";

afterEach(() => {
  cleanup();
});

const ME: PlayerId = 0;
const view = { contract: null, me: ME, opponent: 1, phase: "auction" } as PlayerView;

function standingWith(
  previousPoints: Pair<number> | null,
  halfFormat: "game" | "rubber" = "game",
): MatchStanding {
  return {
    history: [],
    kind: "rubber",
    previous: [],
    previousPoints,
    rubber: newRubber(halfFormat),
  };
}

function show(
  previousPoints: Pair<number> | null,
  format: MatchFormat = "mirror",
  halfFormat: "game" | "rubber" = "game",
): void {
  render(
    createElement(ContractBar, {
      density: "normal",
      format,
      handsPlayed: 1,
      onShowScore: null,
      opponentName: "Computer",
      phase: "auction",
      standing: standingWith(previousPoints, halfFormat),
      view,
    }),
  );
}

const text = (): string => document.body.textContent ?? "";

/**
 * **A two-game match's standing cannot say what it is, and that is the whole hazard.**
 *
 * Each half is a real single game — a line, a part-score, a race to a hundred — so its
 * `RubberState` is indistinguishable from a single game's. Left to the standing alone
 * the strip reads as one game the whole way through and the figure on it is half the
 * story. The format has to arrive from outside, and which half from whether an earlier
 * one has been carried in.
 */
describe("the score strip on a two-game match", () => {
  /**
   * **"Half", not "game".** In this app "game" already means three things — a format on
   * Home, the thing you win at a hundred below the line, and a game of bridge loosely —
   * and since a mirror's halves can each *be* a rubber, calling one a game is sometimes
   * simply wrong. A half is what a mirror has two of, whatever each contains.
   */
  it("says which of the two halves this is", () => {
    show(null);
    expect(text()).toContain("Half 1 of 2");

    cleanup();
    show([420, 130]);
    expect(text()).toContain("Half 2 of 2");
  });

  /**
   * **Three rows, always, and the same three.** The first version changed the label on
   * the running figure and grew a fourth row at half time, so the strip you had learned
   * to read became a different strip mid-match — and the row that appeared moved
   * everything under it, which is the fault this project keeps finding on this screen.
   *
   * Total is the match, This game is the half in hand, Part score is what is still
   * below the line. In the first game the top two agree, which is true rather than
   * redundant: the match *is* that game so far.
   */
  it("totals the match, not the game in hand", () => {
    show(null);
    expect(text()).toContain("Total");
    expect(text()).toContain("Part score");

    cleanup();
    // Second game, with 420-130 carried: Total must be the pair, not this game alone.
    show([420, 130]);
    expect(text()).toContain("Total");
    expect(text()).toContain("420");
    expect(text()).toContain("130");
  });

  /**
   * **Named halves rather than "this game".** A row labelled for the game in hand
   * points at a different game depending on when you read it, which is the one thing a
   * fixed row must not do — and this strip is on screen the entire match.
   *
   * The half not yet played is a row of dashes rather than zeroes: zero is a score
   * somebody made, and there is no second game yet.
   */
  it("names both halves, and leaves the unplayed one blank", () => {
    const labels = (): string[] =>
      [...document.querySelectorAll("span")]
        .map((one) => one.textContent ?? "")
        .filter((one) => ["Total", "1st half", "2nd half", "Part score"].includes(one));

    show(null);
    expect(labels()).toEqual(["Total", "1st half", "2nd half", "Part score"]);
    expect(text()).toContain("—");

    cleanup();
    show([420, 130]);
    expect(labels()).toEqual(["Total", "1st half", "2nd half", "Part score"]);
    expect(text()).toContain("420");
  });

  /**
   * **A mirror's half can itself be a rubber**, chosen independently of the
   * outer format via Home's own "each side, first to 1/2 games" stepper — so
   * this row is gated on the *half's* own format, not on whether the match is
   * a mirror or an ordinary rubber. "0 of 2" rather than "0/2": a count of
   * games reads as a sentence, where Part score reads as a fraction of a
   * hundred points, and the two must not be confused for the same kind of
   * number.
   */
  it("says how many games the half itself needs, when the half is a rubber", () => {
    show(null, "mirror", "rubber");
    expect(text()).toContain("Games won");
    expect(text()).toContain("0 of 2");
    expect(text()).not.toContain("0/2");

    cleanup();
    // A one-game half has no "games needed" to speak of — nothing to show.
    show(null, "mirror", "game");
    expect(text()).not.toContain("Games won");
  });

  it("says none of that for an ordinary rubber", () => {
    show(null, "rubber");

    expect(text()).not.toContain("Game 1 of 2");
    expect(text()).toContain("Total");
  });
});

/**
 * **The rating belongs to a player, and a seat label is the one thing on the board that
 * is one.** It has moved twice, and the second move is the interesting one.
 *
 * It began beside these labels and went to the standing strip because the labels were
 * only drawn on the play screen — so through the draw and the auction, which is most of
 * a deal, it was missing, and a figure that comes and goes invites reading its absence
 * as a change. The strip turned out wrong for a different reason: it is the *score*, and
 * a rating is not part of one. It cannot move during a match and half of it is a pinned
 * anchor that will never move for anybody, so among four figures that do change it was
 * two that never would.
 *
 * Back on the labels, which are now drawn in all three phases — which is what makes the
 * original objection no longer apply.
 */
describe("where a rating is shown", () => {
  const labelled = (rating: number | null): string => {
    cleanup();
    render(
      createElement(SeatLabel, { active: false, name: "Computer", rating, vulnerable: false }),
    );
    return document.body.textContent ?? "";
  };

  it("sits beside the player it belongs to", () => {
    expect(labelled(1400)).toContain("Computer");
    expect(labelled(1400)).toContain("1400");
  });

  /** Null rather than a guess: nobody checks a figure that looks right. */
  it("shows nothing at all until something has said", () => {
    const shown = labelled(null);

    expect(shown).toContain("Computer");
    expect(shown.replace("Computer", "")).not.toMatch(/[0-9]/);
  });

  /** And it is gone from the score, which is what it was cluttering. */
  it("is not on the standing strip", () => {
    show(null);

    expect(text()).not.toMatch(/Rated/);
    expect(text()).toContain("Total");
  });
});

/**
 * **The screen that ends a mirror carries the same three figures the strip did.**
 *
 * Total, then each half, in the order a player has been reading them all match. What
 * it drops is above and below the line: at the end of a pair those describe the
 * *second half only*, which is a true statement about a thing nobody is asking about,
 * sitting directly above the total that decides the match.
 *
 * Ordinary rubbers are untouched — there is no pair, so there is nothing the line
 * figures are only half of.
 */
describe("the final score of a two-half match", () => {
  const finish = (previousPoints: Pair<number> | null, repeated = false): string => {
    cleanup();
    render(
      createElement(DealComplete, {
        dealBonus: 0,
        format: previousPoints === null ? "rubber" : "mirror",
        halfComplete: false,
        matchComplete: true,
        matchWinner: ME,
        onDone: () => {},
        onNextDeal: () => {},
        onPlaySameBoards: null,
        opponentName: "Computer",
        opponentRating: 1400,
        opponentWaitingToContinue: false,
        repeated,
        score: null,
        standing: standingWith(previousPoints),
        view,
        vulnerable: [false, false],
        waitingToContinue: false,
      }),
    );
    return document.body.textContent ?? "";
  };

  it("reflects the strip: total, then each half", () => {
    const shown = finish([420, 130]);

    expect(shown).toContain("Total");
    expect(shown).toContain("1st half");
    expect(shown).toContain("2nd half");
    expect(shown).toContain("420");
    // The line figures belong to one half and would read as the match's.
    expect(shown).not.toContain("Above the line");
  });

  it("leaves an ordinary rubber on its own final score", () => {
    const shown = finish(null);

    expect(shown).toContain("Above the line");
    expect(shown).toContain("Final score");
    expect(shown).not.toContain("1st half");
  });
});

/**
 * **A mirror is rated, and what let it in was measuring the objection rather than
 * arguing about it.**
 *
 * It was excluded for duplicate's reason: its second half is the first half's boards
 * replayed, so the computer meets every one with perfect recall where a person's is
 * good but not exact. `bench/rubber.ts 120 8 format=mirror control nodouble memory`
 * prices that at **+17 ± 34 rating points** — half a standard error from even, with
 * the capability firing on 43% of deals, so a null rather than a dead control. An
 * objection about a quantity does not survive the quantity turning out to be zero.
 *
 * A match played back on an earlier one's boards is still out, and that is a
 * different exclusion: there the recall is the whole point of the format.
 */
describe("which finished matches show a rating change", () => {
  const RATINGS = JSON.stringify({ anchors: {}, bot: 1400, mine: 1500, step: 24 });

  const finished = (over: { format: MatchFormat; repeated: boolean }): string => {
    cleanup();
    window.localStorage.setItem("hb.ratings", RATINGS);
    render(
      createElement(DealComplete, {
        dealBonus: 0,
        format: over.format,
        halfComplete: false,
        matchComplete: true,
        matchWinner: ME,
        onDone: () => {},
        onNextDeal: () => {},
        onPlaySameBoards: null,
        opponentName: "Computer",
        opponentRating: 1400,
        opponentWaitingToContinue: false,
        repeated: over.repeated,
        score: null,
        standing: standingWith(over.format === "mirror" ? [420, 130] : null),
        view,
        vulnerable: [false, false],
        waitingToContinue: false,
      }),
    );
    return document.body.textContent ?? "";
  };

  it("says what a mirror was worth, the same as a rubber", () => {
    expect(finished({ format: "mirror", repeated: false })).toContain("1500");
    expect(finished({ format: "rubber", repeated: false })).toContain("1500");
  });

  /**
   * Null rather than a guess. The server will never move the rating for one, so a
   * figure here would be invented — and nobody checks a number that looks right.
   */
  it("says nothing for a match replayed on an earlier one's boards", () => {
    expect(finished({ format: "rubber", repeated: true })).not.toContain("1500");
  });
});

/**
 * **Half time says which half comes next.** The button read "Same deals back", which
 * is true and describes the cards; what a player needs there is where they are in the
 * pair — and the screen above it already says the deals come back with the draw
 * swapped. The words match the strip and the scorepad, so all three agree.
 */
describe("the screen between the two halves", () => {
  const halfTime = (): string => {
    cleanup();
    render(
      createElement(DealComplete, {
        dealBonus: 0,
        format: "mirror",
        halfComplete: true,
        matchComplete: false,
        matchWinner: null,
        onDone: () => {},
        onNextDeal: () => {},
        onPlaySameBoards: null,
        opponentName: "Computer",
        opponentRating: 1400,
        opponentWaitingToContinue: false,
        repeated: false,
        // A real score, because a half **cannot** end on a passed-out deal — nothing
        // is scored, so nobody reaches a hundred — and the passed-out screen returns
        // before the half-time panel. A fixture with no score tests an unreachable
        // combination and finds nothing.
        score: {
          aboveLine: [0, 0],
          belowLine: [120, 0],
          detail: {
            contractTricks: 120,
            honors: [0, 0],
            insult: 0,
            made: true,
            overtricks: 0,
            slamBonus: 0,
            undertricks: 0,
          },
        },
        standing: standingWith(null),
        // A scored deal has a contract, and the headline reads it off the view.
        view: {
          ...view,
          contract: { declarer: ME, doubling: "none", level: 2, strain: "H" },
        } as PlayerView,
        vulnerable: [false, false],
        waitingToContinue: false,
      }),
    );
    return document.body.textContent ?? "";
  };

  it("names the half about to be played", () => {
    const shown = halfTime();

    expect(shown).toContain("Play 2nd half");
    // And still says the first is over without calling it a result.
    expect(shown).toContain("First half done");
    expect(shown).not.toContain("You win");
  });
});
