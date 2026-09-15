// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { newRubber } from "@hb/engine";
import type {
  BoardOutcome,
  Contract,
  DuplicateResult,
  DuplicateSummary,
  Pair,
  PlayerId,
  PlayerView,
} from "@hb/engine";
import { afterEach, describe, expect, it } from "vitest";
import { ContractBar } from "../src/ui/ContractBar.js";
import type { MatchStanding } from "@hb/engine";

afterEach(() => {
  cleanup();
});

const ME: PlayerId = 0;
const CONTRACT: Contract = { declarer: ME, doubling: "none", level: 4, strain: "H" };

function run(over: Partial<DuplicateResult> & { readonly points: number }): DuplicateResult {
  return { board: 0, contract: CONTRACT, replay: false, score: null, tricksWon: [10, 3], ...over };
}

function board(over: Partial<BoardOutcome> = {}): BoardOutcome {
  return { board: 0, margin: null, played: [], starter: ME, ...over };
}

function session(over: Partial<DuplicateSummary> = {}): DuplicateSummary {
  return {
    boards: [board(), board({ board: 1 })],
    closed: 0,
    complete: false,
    current: { board: 0, replay: false },
    dealsPlayed: 0,
    lastCompleted: null,
    margin: [0, 0],
    points: [0, 0],
    schedule: "halves",
    score: null,
    scoring: "points",
    vulnerable: [false, false],
    winner: null,
    ...over,
  };
}

const VIEW = {
  auction: [],
  contract: null,
  me: ME,
  opponent: 1 as PlayerId,
  phase: "auction",
  tricksWon: [0, 0] as Pair<number>,
} as unknown as PlayerView;

function show(standing: MatchStanding): void {
  render(
    createElement(ContractBar, {
      density: "normal",
      format: "rubber",
      handsPlayed: 0,
      onShowScore: null,
      opponentName: "Computer",
      phase: "auction",
      standing,
      view: VIEW,
    }),
  );
}

function text(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

/**
 * The always-visible score during a session.
 *
 * A rubber's strip has two columns because both sides really do have a running
 * total. A session has **one signed number**, and drawing it twice — once negated —
 * spent a phone's scarcest space saying the same thing twice. Boards went with it:
 * the total is the sum of every hand's own score, so counting boards was arithmetic
 * nobody needed to follow.
 */
describe("the fixed score during a session", () => {
  /**
   * The fixture has to hold a **closed** board. Settled sums boards both runs of which
   * are in, so a session with nothing closed draws 0 whatever its margin is — these two
   * used to pass off the "still out" row, and when that was deleted they were asserting
   * a figure the strip had no reason to show.
   */
  it("shows one signed figure and no two-sided columns", () => {
    show({
      kind: "duplicate",
      summary: session({
        boards: [
          board({ margin: 250, played: [run({ points: 420 }), run({ points: 170, replay: true })] }),
          board({ board: 1 }),
        ],
        closed: 1,
        margin: [250, -250],
      }),
    });

    expect(text()).toContain("Settled");
    expect(text()).toContain("+250");
    // The You / opponent header belongs to a two-column standing.
    expect(screen.queryByText("Computer")).toBeNull();
    expect(text()).not.toContain("Boards");
  });

  it("shows a negative score as negative rather than as the opponent's", () => {
    show({
      kind: "duplicate",
      summary: session({
        boards: [
          board({
            margin: -140,
            played: [run({ points: -90 }), run({ points: 50, replay: true })],
          }),
          board({ board: 1 }),
        ],
        closed: 1,
        margin: [-140, 140],
      }),
    });

    expect(text()).toContain("−140");
  });

  it("says how far through the session this deal is", () => {
    show({ kind: "duplicate", summary: session() });
    // Two boards, so ten... four deals.
    expect(text()).toContain("Deal 1 of 4");
  });

  /**
   * Named so a player has some way to answer "which duplicate is this" mid-session
   * without leaving the board — Settings is where the order is chosen, not where
   * anyone would think to look while actually playing one.
   */
  it("names the order the session is being played in", () => {
    show({ kind: "duplicate", summary: session({ schedule: "sequence" }) });
    expect(text()).toContain("In order");
  });

  it("names the order in compact density too", () => {
    render(
      createElement(ContractBar, {
        density: "compact",
        format: "rubber",
        handsPlayed: 0,
        onShowScore: null,
        opponentName: "Computer",
        phase: "auction",
        standing: { kind: "duplicate", summary: session({ schedule: "random" }) },
        view: VIEW,
      }),
    );
    expect(text()).toContain("Shuffled");
  });

  it("names it a replay in the header line once one is under way", () => {
    show({
      kind: "duplicate",
      summary: session({
        boards: [board({ played: [run({ points: 170 })] }), board({ board: 1 })],
        current: { board: 0, replay: true },
        dealsPlayed: 1,
        margin: [0, 0],
      }),
    });

    expect(text()).toContain("replay");
  });

  /**
   * **Nothing settled is zero, not a dash.** A board played once has contributed a
   * real score and nothing decided, so the settled figure is the sum of no boards —
   * which is 0. The same rule the scorepad settled on for its own dash: blank keeps
   * its one meaning of "there is nothing here", and this is not that.
   *
   * **And the run-1 score is not shown at all.** A second row used to say what was
   * still out; a board's margin is your net in both runs added, so a board played once
   * carries the luck of the stream you held and a big figure there is a warning rather
   * than a credit. The strip says what is decided and stays quiet about the rest.
   */
  it("settles nothing while a board has been played once, and says so without a figure", () => {
    show({
      kind: "duplicate",
      summary: session({
        boards: [board({ played: [run({ points: 420 })] }), board({ board: 1 })],
        dealsPlayed: 1,
        margin: [420, -420],
      }),
    });

    expect(text()).toContain("Settled 0/2");
    expect(text()).not.toContain("still out");
    // The board's own run-1 score is deliberately absent — it is not a standing.
    expect(text()).not.toContain("+420");
  });

  it("sums only the boards that have actually closed, and counts them the same way", () => {
    show({
      kind: "duplicate",
      summary: session({
        boards: [
          board({
            margin: 250,
            played: [
              run({ points: 420 }),
              run({ points: 170, replay: true }),
            ],
          }),
          // Only a first run so far — its 90 has already moved Total to 340, but
          // it is not Closed's to say until the replay comes in.
          board({ board: 1, played: [run({ board: 1, points: 90 })] }),
        ],
        closed: 1,
        dealsPlayed: 3,
        margin: [340, -340],
      }),
    });

    // **The anti-vacuity of this whole change.** The open board's 90 is in the total
    // and must not be in Settled, so asserting +250 alone would pass against a strip
    // that had simply kept showing the running total. The absence of 340 is what says
    // the settled figure is a different number from the total, and the absence of 90
    // is what says the open board is not being drawn either.
    expect(text()).toContain("Settled 1/2");
    expect(text()).toContain("+250");
    expect(text()).not.toContain("+340");
    expect(text()).not.toContain("+90");
  });

  /**
   * **Under IMPs the settled figure names its currency and nothing is ever "out" with
   * a number beside it** — `impsFor` converts a board's margin and an open board has
   * none. The count still gets said, since that half of the question is answerable.
   */
  it("names IMPs on the settled figure rather than having its own row", () => {
    show({
      kind: "duplicate",
      summary: session({
        boards: [board({ margin: 250, played: [run({ points: 420 }), run({ points: 170, replay: true })] })],
        closed: 1,
        margin: [250, -250],
        scoring: "imps",
      }),
    });

    expect(text()).toContain("Settled (IMPs) 1/1");
    // **+6, not +250** — the board's 250-point margin converted. Hardcoded rather than
    // asked of `impsFor`, which is what makes this catch a strip showing raw points:
    // computing the expectation through the same function the component uses would
    // agree with it whatever either said.
    expect(text()).toContain("+6");
    expect(text()).not.toContain("+250");
    // Nothing anywhere claims a board is outstanding.
    expect(text()).not.toContain("still out");
  });

  it("does not name which board it is", () => {
    show({
      kind: "duplicate",
      summary: session({ current: { board: 1, replay: true }, dealsPlayed: 2 }),
    });
    expect(text()).not.toContain("Board");
  });

  it("leaves a rubber's two columns alone", () => {
    show({ kind: "rubber", history: [], previous: [], previousPoints: null, rubber: newRubber("rubber") });

    expect(screen.getByText("Computer")).toBeTruthy();
    expect(text()).toContain("Part score");
  });
});
