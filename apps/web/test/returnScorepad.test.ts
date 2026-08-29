// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { newRubber } from "@hb/engine";
import type {
  Contract,
  DealRecord,
  Pair,
  PlayerId,
  PlayerView,
  ScoreDetail,
} from "@hb/engine";
import { afterEach, describe, expect, test } from "vitest";
import { Scorepad } from "../src/ui/Scorepad.js";

afterEach(() => {
  cleanup();
});

const ME: PlayerId = 0;
const THEM: PlayerId = 1;
const CONTRACT: Contract = { declarer: ME, doubling: "none", level: 2, strain: "H" };

/** A deal that paid `mine` below the line to me and `theirs` to the opponent. */
function record(
  mine: number,
  theirs: number,
  honors: Pair<number> = [0, 0],
  starter: PlayerId = ME,
  over: Partial<ScoreDetail> = {},
): DealRecord {
  const detail: ScoreDetail = {
    contractTricks: 8,
    honors,
    insult: 0,
    made: true,
    overtricks: 0,
    slamBonus: 0,
    undertricks: 0,
    ...over,
  };

  return {
    contract: CONTRACT,
    score: { aboveLine: [0, 0], belowLine: [mine, theirs], detail },
    starter,
    tricksWon: [8, 5],
    wonGameBy: null,
  };
}

const view = { me: ME, opponent: THEM } as PlayerView;

function show(
  previous: readonly DealRecord[],
  history: readonly DealRecord[] = [record(60, 0)],
  previousPoints: Pair<number> | null = previous.length > 0 ? [0, 0] : null,
): void {
  render(
    createElement(Scorepad, {
      format: "rubber",
      history,
      opponentName: "Computer",
      previous,
      previousPoints,
      // A mirror's halves are single games unless somebody asks for rubbers, and the
      // pad names them from this — so the fixture has to be the shape it describes.
      rubber: newRubber("game"),
      view,
    }),
  );
}

const text = (): string => document.body.textContent ?? "";

describe("the scorepad once there are two games", () => {
  /**
   * **A column is a game, a row is a deal, and every figure is signed this seat's way.**
   *
   * This replaced a per-board pairing that was correct and still hard to read — it put
   * each *holding* on its own row so the like-for-like comparison sat in a column, and
   * asked the reader to hold "which stream was this" in their head on every line. What
   * a two-game match turns on is simpler, and this is that shape.
   *
   * The fixture: in the first game I made 120 against their 30, so my net is +90. In
   * the second they made 90 against my 40, so mine is −50.
   */
  test("shows each game in its own column, signed this seat's way", () => {
    show([record(120, 30, [0, 0], ME)], [record(40, 90, [0, 0], THEM)], [120, 30]);

    expect(screen.getByText("First half")).toBeTruthy();
    expect(screen.getByText("Second half")).toBeTruthy();
    expect(text()).toContain("+90");
    expect(text()).toContain("−50");
  });

  /**
   * The pair of game totals is what decides the match, so it is the emphasised line
   * rather than something to be added up by the reader.
   */
  /**
   * **A game's total is not the sum of its deals**, and the first version of this pad
   * said it was. Winning a game pays `matchBonusFor`, which lands on the rubber's own
   * above-line rather than on any deal — so a column footed by adding up its rows was
   * short by the bonus and disagreed with every other total on screen.
   *
   * Here the first game's deals come to +90 and its real total is +390, so the bonus is
   * the 300 between them. A pad that sums its rows shows +90 and fails this.
   */
  test("foots each column with the game's real total, bonus included", () => {
    show([record(120, 30, [0, 0], ME)], [record(40, 90, [0, 0], THEM)], [420, 30]);

    const shown = text();
    expect(shown).toContain("+390");
    // Marked with a rule where the half was won, carrying what winning it paid.
    expect(shown).toContain("game +300");
  });

  /**
   * **The rule sits under the deal that won the half, not at the foot of the pad.**
   *
   * At the foot it slid down with every deal played, so a line marking a moment that had
   * already happened kept moving — the one thing a mark on a record must not do. A paper
   * scorepad rules its line where the game ended and leaves it there.
   *
   * Here the first half was won on its second deal while the second half is still being
   * played, so the rule must be inside the rows and above the third — not after
   * everything.
   */
  test("rules the line under the deal that won the half", () => {
    show(
      [record(60, 0, [0, 0], ME), record(60, 0, [0, 0], ME)],
      [record(40, 0, [0, 0], THEM), record(30, 0, [0, 0], THEM), record(20, 0, [0, 0], THEM)],
      [420, 0],
    );

    const rows = [...document.querySelectorAll("div")].map((one) => one.textContent ?? "");
    const ruled = rows.findIndex((one) => one.startsWith("game +300"));
    const lastRow = rows.findIndex((one) => one.startsWith("3"));

    expect(ruled).toBeGreaterThan(-1);
    expect(lastRow).toBeGreaterThan(-1);
    // The rule comes before the third deal, because the first half ended at the second.
    expect(ruled).toBeLessThan(lastRow);
  });

  /**
   * **It does not claim a row is a like-for-like comparison**, and saying so is the
   * whole reason the caption exists. The seats swap, so on any board you held one
   * stream in the first game and the other in the second; reading across says how that
   * board went *for you* twice, not who did better with the same cards.
   */
  test("says which way the figures are signed, and adds the pair up", () => {
    show([record(120, 30, [0, 0], ME)], [record(40, 90, [0, 0], THEM)], [420, 30]);

    expect(text()).toContain("Signed your way");
    expect(text()).toContain("Both halves");
  });

  test("a single game on its own is still a running list of deals", () => {
    show([], [record(60, 0)]);

    expect(screen.queryByText("First half")).toBeNull();
    expect(screen.queryByText("Second half")).toBeNull();
  });
});

describe("a deal where both sides scored the same", () => {
  /**
   * **A dash says nothing happened, and that is not what a zero net means.**
   *
   * Five clubs made pays declarer 100 below the line; a defender holding four club
   * honours takes 100 above. The deal nets zero with two hundred points on the table —
   * and the pad drew it as a dash, which reads as no change and is only true of a deal
   * that was passed out. Reported exactly that way, and it was not passed out.
   *
   * Reachable in ordinary play and common here: a quarter of deals pay honours, because
   * each hand holds thirteen of only twenty-six dealt cards and the draw selects for
   * high ones.
   */
  test("shows a zero rather than nothing at all, and says why", () => {
    // Both sides 100: declarer below the line, the defender in honours.
    const level = record(100, 0, [0, 100], ME);
    show([level], [record(60, 0, [0, 0], THEM)], [100, 100]);

    const shown = text();
    // **And the reason is on screen.** Honors are the one component of a score the row
    // cannot already explain — overtricks, the insult and a slam bonus all follow from
    // the contract, where honors go to whoever holds them. Without this the deal reads
    // as a zero with nothing to account for it, which is where the report started.
    expect(shown).toContain("honors");
    expect(shown).toContain("−100");
    // Asserted as the *absence of the dash* rather than the presence of a zero: the row
    // holds a 100, and "contains a 0" matches that happily — which is how the first
    // version of this test passed with the bug still in place.
    expect(shown).not.toContain("—");
    // The contract is still named, so it plainly was not passed out.
    expect(shown).not.toContain("passed out");
  });

  /** Only on the deals that paid them — about one in five, so the other four cost
   *  nothing. */
  test("says nothing about honors on a deal that paid none", () => {
    show([record(120, 0, [0, 0], ME)], [record(60, 0, [0, 0], THEM)], [120, 0]);

    expect(text()).not.toContain("honors");
  });

  /** A cell with no deal in it stays blank — that is the distinction the dash was
   *  wrongly carrying: nothing there, as against nothing in it. */
  test("leaves a row with no second deal blank", () => {
    show([record(60, 0, [0, 0], ME), record(60, 0, [0, 0], ME)], [record(60, 0)], [120, 0]);

    // Two rows on the left, one on the right; the pad renders both rows regardless.
    expect(text()).toContain("First half");
  });
});

describe("who was paid honors", () => {
  /**
   * **Reported as a scoring bug and it is not one.** Honors go to whoever holds them,
   * defender included, so a deal can pay both sides — and the shape that reads as
   * broken is a contract going down while its declarer still scores more than the
   * side that set them. Over 400 deals 20 paid both sides and all 20 were honors; the
   * pad simply never said the word. A quarter of deals pay them here, because each
   * hand holds thirteen of twenty-six dealt cards and the draw selects for high ones.
   */
  test("names them, so points the contract does not explain are accounted for", () => {
    show([], [record(0, 50, [100, 0])]);

    const line = screen.getByText("honors").parentElement;
    expect(line?.textContent).toContain("100");
  });

  test("says nothing when nobody held them", () => {
    show([], [record(60, 0)]);

    expect(screen.queryByText("honors")).toBeNull();
  });
});

/**
 * **How the contract went, in bridge's own notation.**
 *
 * The one-column pad has room to say "made +2" in words; a column of the two-game pad
 * is about half a phone wide and already carries a contract, a declarer and a signed
 * total, so it said nothing at all about the result. `+2` and `−1` fit where the words
 * do not.
 */
describe("how the contract went", () => {
  const cells = (): string =>
    (document.body.textContent ?? "").replace(/\s+/g, " ");

  test("marks overtricks and undertricks against the contract", () => {
    show(
      [record(0, 100, [0, 0], ME, { made: false, undertricks: 1 })],
      [record(150, 0, [0, 0], THEM, { overtricks: 2 })],
      [0, 100],
    );

    expect(cells()).toContain("−1");
    expect(cells()).toContain("+2");
  });

  /**
   * **Made exactly is `=`, not a blank**, which is the lesson this pad has already
   * learnt from the other side: an empty cell has to mean there is no deal there. A
   * mark that vanishes on the commonest result would leave the reader working out
   * which kind of nothing they were looking at.
   */
  test("says so when a contract was made exactly", () => {
    show([record(60, 0)], [record(60, 0, [0, 0], THEM)], [60, 0]);

    expect(cells()).toContain("=");
  });
});
