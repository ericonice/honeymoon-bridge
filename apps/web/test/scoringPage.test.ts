// @vitest-environment jsdom
import {
  contractTrickPoints,
  GAME_THRESHOLD,
  honorsFor,
  matchBonusFor,
  overtrickPoints,
  scoreDuplicateDeal,
  slamBonus,
  undertrickPoints,
} from "@hb/engine";
import type { Card, Strain } from "@hb/engine";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, test } from "vitest";
import { ScoringOverlay } from "../src/ui/ScoringOverlay.js";

/**
 * The scoring page must agree with the scorer.
 *
 * `HelpOverlay` deliberately said nothing about scoring for a long time, because
 * a hand-written table is a second account of the rules with no way to stay
 * honest as the first one changes. This file is what makes the page allowed to
 * exist: every figure it prints is compared against the engine function that
 * produces it, so a change to a trick value or a penalty either moves the page
 * or fails here.
 *
 * The expectations are therefore computed from `@hb/engine` directly rather than
 * from `scoringFacts.ts`. Comparing the page against the module that feeds it
 * would pass no matter what either of them said.
 */

afterEach(cleanup);

function show(): void {
  render(createElement(ScoringOverlay, { onClose: () => {} }));
}

/** The page's text, whitespace flattened, since the figures sit in their own spans. */
const text = (): string => (document.body.textContent ?? "").replace(/\s+/g, " ");

/** One table, by the caption that names it, as rows of cell text. */
function table(caption: string): readonly (readonly string[])[] {
  const found = [...document.querySelectorAll("table")].find((one) =>
    (one.querySelector("caption")?.textContent ?? "").includes(caption),
  );
  if (found === undefined) {
    throw new Error(`no table captioned "${caption}"`);
  }
  return [...found.querySelectorAll("tbody tr")].map((row) =>
    [...row.querySelectorAll("th, td")].map((cell) => (cell.textContent ?? "").trim()),
  );
}

const STRAINS: readonly Strain[] = ["C", "D", "H", "S", "NT"];

test("the trick table is what the engine charges per trick", () => {
  show();
  const rows = table("Points per trick");

  expect(rows).toHaveLength(STRAINS.length);
  STRAINS.forEach((strain, index) => {
    const first = contractTrickPoints(1, strain);
    const after = contractTrickPoints(2, strain) - first;
    expect(rows[index]!.slice(1)).toEqual([String(first), String(after)]);
  });
});

/**
 * 3NT, 4H and 5C are not typed anywhere — the page searches for the cheapest
 * level that reaches the threshold. Raise a suit's trick value and this sentence
 * has to change with it.
 */
test("the game levels follow from the trick values rather than being stated", () => {
  show();
  const said = text();

  for (const strain of STRAINS) {
    const level = [1, 2, 3, 4, 5, 6, 7].find(
      (candidate) => contractTrickPoints(candidate as 1, strain) >= GAME_THRESHOLD,
    );
    expect(level, `${strain} should reach a game somewhere`).toBeDefined();
    const symbol = strain === "NT" ? "NT" : { C: "♣", D: "♦", H: "♥", S: "♠" }[strain];
    expect(said).toContain(`${level}${symbol}`);
  }
});

/**
 * The page's central argument, and the one thing on it that is an *argument*
 * rather than a figure: the same eleven tricks are a game at one bid and not at
 * the other. If overtricks ever started counting below the line this would stop
 * being true, and this test is what would notice.
 */
test("the worked example really does show the same tricks scoring two ways", () => {
  show();
  const rows = table("Eleven tricks in hearts");

  const at = (bid: 3 | 4): readonly string[] => [
    String(contractTrickPoints(bid, "H")),
    String(overtrickPoints(5 - bid, "H", "none", false)),
  ];

  expect(rows[0]!.slice(1)).toEqual(at(3));
  expect(rows[1]!.slice(1)).toEqual(at(4));
  // The point of the pair: one is a game and the other is not, on equal tricks.
  expect(contractTrickPoints(3, "H")).toBeLessThan(GAME_THRESHOLD);
  expect(contractTrickPoints(4, "H")).toBeGreaterThanOrEqual(GAME_THRESHOLD);
});

test("the penalty table is what the engine charges for going down", () => {
  show();
  const rows = table("doubled contract costs");

  rows.slice(0, 4).forEach((row, index) => {
    const short = index + 1;
    expect(row[0]).toBe(String(short));
    expect(row.slice(1)).toEqual([
      String(undertrickPoints(short, "doubled", false)),
      String(undertrickPoints(short, "doubled", true)),
    ]);
  });

  // And the undoubled figures, which are prose rather than a table.
  expect(text()).toContain(String(undertrickPoints(1, "none", false)));
  expect(text()).toContain(String(undertrickPoints(1, "none", true)));
});

test("the slam bonuses are the engine's", () => {
  show();
  const rows = table("reaching a slam");

  expect(rows).toEqual([
    ["6", String(slamBonus(6, false)), String(slamBonus(6, true))],
    ["7", String(slamBonus(7, false)), String(slamBonus(7, true))],
  ]);
});

test("honors are what honorsFor awards, including the four aces", () => {
  show();
  const said = text();
  const top = (count: number): readonly Card[] =>
    ([14, 13, 12, 11, 10] as const).slice(0, count).map((rank) => ({ rank, suit: "S" }));
  const aces = (["C", "D", "H", "S"] as const).map((suit) => ({ rank: 14, suit }) as Card);

  expect(said).toContain(String(honorsFor(top(4), "S")));
  expect(said).toContain(String(honorsFor(top(5), "S")));
  expect(said).toContain(String(honorsFor(aces, "NT")));
  // The part people get wrong: a defender scores them too.
  expect(said).toContain("defender included");
});

test("the match bonuses are the engine's, and the two rubber cases are distinguished", () => {
  show();
  const said = text();

  expect(said).toContain(String(matchBonusFor("rubber", 0)));
  expect(said).toContain(String(matchBonusFor("rubber", 1)));
  expect(said).toContain(String(matchBonusFor("game", 0)));
  expect(matchBonusFor("rubber", 0)).not.toBe(matchBonusFor("rubber", 1));
});

/**
 * The page is for somebody who has not played rubber bridge, so the two ideas
 * they cannot get anywhere else have to actually be on it: which side of the line
 * a score lands, and that vulnerability is a consequence of winning.
 */
test("it explains the line and what vulnerability is", () => {
  show();
  const said = text();

  expect(said).toContain("below the line");
  expect(said).toContain("above");
  expect(said).toContain("vulnerable");
  expect(said).toContain(String(GAME_THRESHOLD));
});

/**
 * The duplicate figures, against `scoreDuplicateDeal` itself.
 *
 * Same discipline as everything above: the expectations come from the engine
 * function the game actually settles a session with, not from `scoringFacts.ts`.
 * A page compared against the module feeding it would agree with whatever either
 * of them said.
 */
test("the duplicate bonuses are the ones a session is settled with", () => {
  show();
  const shown = text();

  const scored = (bid: 3 | 4, tricks: number): ReturnType<typeof scoreDuplicateDeal> =>
    scoreDuplicateDeal(
      {
        contract: { declarer: 0, doubling: "none", level: bid, strain: "H" },
        hands: [[], []],
        tricksWon: [tricks, 13 - tricks],
      },
      [false, false],
    );

  // A game, a part-score, and a contract that failed.
  expect(shown).toContain(String(scored(4, 10).bonus));
  expect(shown).toContain(String(scored(3, 9).bonus));
  // Stated in words rather than as a digit, so the test guards the sentence: if a
  // failed contract ever paid something, the page would be lying and this fails.
  expect(scored(4, 9).bonus).toBe(0);
  expect(shown).toContain("no bonus at all");

  // The worked example: the same eleven tricks, bid two ways.
  expect(shown).toContain(String(scored(3, 11).points[0]));
  expect(shown).toContain(String(scored(4, 11).points[0]));
  // And the point of it — bidding the game is worth more.
  expect(scored(4, 11).points[0]).toBeGreaterThan(scored(3, 11).points[0]);
});
