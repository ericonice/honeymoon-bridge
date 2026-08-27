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
    margin: [0, 0],
    score: null,
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
      handsPlayed: 0,
      onShowScore: null,
      opponentName: "Computer",
      phase: "auction",
      ratings: { mine: null, opponent: null },
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
  it("shows one signed score and no columns", () => {
    show({ kind: "duplicate", summary: session({ margin: [250, -250] }) });

    expect(text()).toContain("Score");
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
   * The one thing the strip could not say and the reason it changed: whether this
   * is a deal you have played before. Which board it is stays hidden — the replay
   * order is random so that identifying it is the player's job.
   */
  it("says nothing about a replay on a deal nobody has seen", () => {
    show({ kind: "duplicate", summary: session() });

    expect(text()).not.toContain("replay");
    // The row is still there, so the strip keeps its height from deal to deal.
    expect(text()).toContain("Played before");
    expect(text()).toContain("—");
  });

  it("flags a replay and what the deal came to the first time", () => {
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
    expect(text()).toContain("+170");
  });

  it("does not name which board it is", () => {
    show({
      kind: "duplicate",
      summary: session({ current: { board: 1, replay: true }, dealsPlayed: 2 }),
    });
    expect(text()).not.toContain("Board");
  });

  it("leaves a rubber's two columns alone", () => {
    show({ kind: "rubber", history: [], rubber: newRubber("rubber") });

    expect(screen.getByText("Computer")).toBeTruthy();
    expect(text()).toContain("Part score");
  });
});
