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
  it("shows a total and no two-sided columns", () => {
    show({ kind: "duplicate", summary: session({ margin: [250, -250] }) });

    expect(text()).toContain("Total");
    expect(text()).toContain("+250");
    // The You / opponent header belongs to a two-column standing.
    expect(screen.queryByText("Computer")).toBeNull();
    expect(text()).not.toContain("Boards");
  });

  it("shows a negative score as negative rather than as the opponent's", () => {
    show({ kind: "duplicate", summary: session({ margin: [-140, 140] }) });
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
   * **Closed is the always-visible reading of what the session's actually-cancelled
   * boards come to — a figure this strip is now the main place to see, rather than
   * only in the scorepad a tap away.** It reads "—" until a board has come round
   * twice, the same convention `firstPlayTotal`/`replayTotal` already use, even
   * though `Total` may have already moved from a board's lone first run.
   */
  it("reads Closed as a dash before any board has come round twice, even once Total has moved", () => {
    show({
      kind: "duplicate",
      summary: session({
        boards: [board({ played: [run({ points: 420 })] }), board({ board: 1 })],
        dealsPlayed: 1,
        margin: [420, -420],
      }),
    });

    expect(text()).toContain("+420");
    // Two boards, neither of them this one's — its own row is what says which.
    expect(text()).toContain("Closed 0/2");
    expect(text()).toContain("—");
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

    expect(text()).toContain("Closed 1/2");
    expect(text()).toContain("+250");
  });

  /**
   * **Under IMPs, Total and Closed always agree — see `closedMarginTotal`'s own
   * doc — so showing both would be showing the same number twice.** One row
   * survives, carrying the board count Closed used to and labelled with the
   * scoring points never needs to name.
   */
  it("collapses Total and Closed into one row under IMPs, rather than showing the same number twice", () => {
    show({
      kind: "duplicate",
      summary: session({
        boards: [board({ margin: 250, played: [run({ points: 420 }), run({ points: 170, replay: true })] })],
        closed: 1,
        margin: [250, -250],
        scoring: "imps",
      }),
    });

    expect(text()).toContain("IMPs · 1/1");
    // Only the one row — not a "Closed" label repeating the same figure.
    expect(text()).not.toContain("Closed 1/1");
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
