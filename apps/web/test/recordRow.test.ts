// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { OpponentMatch, OpponentRecord } from "../src/game/records.js";
import { Record } from "../src/ui/Record.js";

const match = (over: Partial<OpponentMatch> = {}): OpponentMatch => ({
  botVersion: 2,
  deals: 8,
  drawn: false,
  finishedAt: Date.UTC(2026, 7, 22, 16, 42),
  pointsAgainst: 410,
  pointsFor: 890,
  won: true,
  ...over,
});

const record = (over: Partial<OpponentRecord> = {}): OpponentRecord => ({
  deals: 146,
  drawn: 0,
  format: "rubber",
  lastPlayed: Date.now(),
  lost: 7,
  matches: [match(), match({ finishedAt: Date.UTC(2026, 7, 21, 20, 15), pointsAgainst: 980, pointsFor: 620, won: false })],
  name: "Computer",
  opponentKey: "bot",
  pointsAgainst: 11_789,
  pointsFor: 12_430,
  rating: 1200,
  won: 13,
  ...over,
});

let robot: readonly OpponentRecord[] = [record()];

/** Twelve points, with the opponent changing at the fourth — enough to draw. */
const HISTORY = [1470, 1440, 1442, 1444, 1447, 1449, 1451, 1453, 1427, 1434, 1441, 1514].map(
  (rating, index) => ({ botVersion: index < 4 ? 1 : 2, rating }),
);

vi.mock("../src/game/records.js", () => ({
  resetRecord: vi.fn(),
  useRecentMatches: () => ({ loading: false, matches: [] }),
  useRecords: () => ({
    loading: false,
    records: { opponents: [], rating: { history: HISTORY, played: 31, value: 1514 }, robot },
    reload: vi.fn(),
  }),
  STARTING_RATING: 1500,
  knownRatings: () => ({ bot: 1200, mine: 1514 }),
  rememberRatings: vi.fn(),
}));

afterEach(cleanup);

function show(): void {
  render(createElement(Record, { onBack: () => {}, onSignIn: () => {}, signedIn: true }));
}

/** The row's text with runs of whitespace flattened, since it is built from spans. */
function rowText(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

/** The column headings, in order. */
function headings(): readonly string[] {
  const head = document.querySelector('[class~="items-baseline"][class~="pb-1"]');
  return [...(head?.querySelectorAll("span") ?? [])].map((span) => span.textContent ?? "");
}

/**
 * One opponent line, as its parts.
 *
 * Joined from the leaf spans rather than read off `textContent`: the row's gaps are
 * flex, not whitespace, so the raw text runs every figure together.
 */
function lines(): readonly string[] {
  return [...document.querySelectorAll('[class~="items-baseline"][class~="py-1.5"]')].map((row) =>
    [...row.querySelectorAll("span")]
      .filter((span) => span.children.length === 0)
      .map((span) => (span.textContent ?? "").trim())
      .filter((text) => text !== "")
      .join(" "),
  );
}

test("an opponent is one line, in the columns the header names", () => {
  robot = [record()];
  show();

  // The header is paid for once above the list, not per row.
  // Six, the last empty: labelling the chevron would be labelling the whole row.
  expect(headings()).toEqual(["opponent", "w–l", "hands", "points", "diff", ""]);
  expect(lines()).toHaveLength(1);
  expect(lines()[0]).toBe(
    "Computer cpu 13–7 146 12,430 points for, 11,789 against +641",
  );
});

/**
 * The bar is the only thing on this screen that holds the point totals, and it
 * holds them as a proportion — so the figures themselves live on a visually hidden
 * node, which is the one place they are free. Losing them there as well would make
 * the record unreadable rather than merely compact.
 */
test("the points bar states its totals for anything not looking at it", () => {
  robot = [record()];
  show();

  expect(rowText()).toContain("12,430 points for, 11,789 against");
  const [mine, theirs] = [...document.querySelectorAll('[class~="h-full"]')];
  expect(mine!.getAttribute("style")).toContain("width: 51.");
  expect(theirs!.getAttribute("style")).toContain("width: 48.");
});

/**
 * What the single line gave up, and why each is safe to lose. "20 matches" is won
 * plus lost, already in the `13–7`. "Last played" is what the list's own
 * most-recent-first ordering says. And the deals, the two point totals and the
 * per-deal rate were four captioned figures that read well and cost five lines per
 * opponent who had played both formats — a standings list is scanned, not read,
 * and the match list below carries every individual game with its own points.
 */
/**
 * What the columns replaced. "N matches" is won plus lost, already in the `13–7`.
 * "Last played" is what the list's own most-recent-first sort says. And a caption
 * per figure per row is what made an earlier version cost five lines an opponent —
 * one header above the list does the same job once.
 */
test("nothing is captioned or restated on the row itself", () => {
  robot = [record()];
  show();

  for (const gone of ["20 matches", "last played", "per deal", "+4.4"]) {
    expect(rowText(), `"${gone}" is still on the opponent line`).not.toContain(gone);
  }
});

test("an opponent played in both formats names them, on a line each", () => {
  robot = [record(), record({ deals: 9, format: "game", lost: 1, pointsAgainst: 200, pointsFor: 290, won: 2 })];
  show();

  expect(lines().map((line) => line.replace(/ \d[\d,]* points for.*against/, ""))).toEqual([
    "Computer cpu rubbers 13–7 146 +641",
    "Computer cpu single games 2–1 9 +90",
  ]);
});

/**
 * The bug this replaced. An opponent's formats were two named slots — a rubber
 * and a game — so a third simply had nowhere to land and **was dropped without
 * failing**: duplicate sessions were being recorded and never appeared. A list is
 * the honest shape for "whichever formats have been played", and it is what makes
 * a fourth format need no change here at all.
 */
test("a third format lands on the list rather than falling off it", () => {
  robot = [
    record(),
    record({ deals: 9, format: "game", lost: 1, pointsAgainst: 200, pointsFor: 290, won: 2 }),
    record({ deals: 20, format: "duplicate", lost: 1, pointsAgainst: 0, pointsFor: 340, won: 1 }),
  ];
  show();

  expect(lines().map((line) => line.replace(/ \d[\d,]* points for.*against/, ""))).toEqual([
    "Computer cpu rubbers 13–7 146 +641",
    "Computer cpu single games 2–1 9 +90",
    "Computer cpu duplicate sessions 1–1 20 +340",
  ]);
});

/**
 * A drawn match is a third outcome, and duplicate makes it ordinary: a board is
 * flat whenever both of its runs score the same, so a short session is level a fair
 * fraction of the time. The third figure appears only when there is one — every
 * rubber row would otherwise carry a "–0" for something that cannot happen to it,
 * on a row that is scanned rather than read.
 */
test("a drawn match is counted as neither won nor lost", () => {
  robot = [record({ drawn: 2, format: "duplicate", lost: 3, won: 5 })];
  show();

  expect(lines()[0]).toContain("5–3–2");
});

test("a record with no draws says nothing about them", () => {
  robot = [record()];
  show();

  expect(lines()[0]).toContain("13–7");
  expect(lines()[0]).not.toContain("13–7–");
});

test("a losing record shows the margin as negative, with a real minus sign", () => {
  robot = [record({ lost: 13, pointsAgainst: 12_430, pointsFor: 11_789, won: 7 })];
  show();

  // U+2212, not a hyphen — it sits beside tabular figures and has to read as a sign.
  expect(lines()[0]).toContain("7–13");
  expect(lines()[0]).toContain("−641");
});

test("a record with nothing in it yet draws an empty bar rather than dividing by zero", () => {
  robot = [record({ deals: 0, lost: 0, pointsAgainst: 0, pointsFor: 0, won: 0 })];
  show();

  expect(lines()[0]).toContain("0–0");
  expect(lines()[0]).toContain("+0");
  expect(document.querySelectorAll('[class~="h-full"]')).toHaveLength(0);
  expect(rowText()).not.toContain("NaN");
});

/**
 * The opponent rows.
 *
 * Found by `aria-expanded`, which is what a row *is* — the one control on this
 * screen that opens a panel. Selecting them by a padding class was tried and broke
 * the moment the screen grew another control that shared it: the view switch is
 * also a button, also in the same padding, and is not a row.
 */
function rows(): readonly HTMLElement[] {
  return [...document.querySelectorAll("button[aria-expanded]")] as HTMLElement[];
}

/** Taps the nth opponent row. */
function tap(index = 0): void {
  const row = rows()[index];
  act(() => {
    row?.click();
  });
}

/** The opened panel's label/value pairs. */
function facts(): Record<string, string> {
  const list = document.querySelector("dl");
  const terms = [...(list?.querySelectorAll("dt") ?? [])];
  const values = [...(list?.querySelectorAll("dd") ?? [])];
  return Object.fromEntries(
    terms.map((term, index) => [
      term.textContent ?? "",
      (values[index]?.textContent ?? "").replace(/\s+/g, " ").trim(),
    ]),
  );
}

/**
 * The row is a control, not a decorated div. It has to be one for the keyboard and
 * for a screen reader to be told the panel exists at all, which `aria-expanded` is.
 */
test("a row says whether it is open, and only one is", () => {
  robot = [record(), record({ deals: 9, format: "game", lost: 1, pointsAgainst: 200, pointsFor: 290, won: 2 })];
  show();

  const expanded = (): (string | null)[] =>
    rows().map((row) => row.getAttribute("aria-expanded"));

  expect(expanded()).toEqual(["false", "false"]);
  expect(document.querySelector("dl")).toBeNull();

  tap(0);
  expect(expanded()).toEqual(["true", "false"]);

  // Opening another closes the first: a panel breaks the column alignment where it
  // sits, so two at once would leave the list looking like the sentence it replaced.
  tap(1);
  expect(expanded()).toEqual(["false", "true"]);

  // And the open one closes, which is the only way back to a list that is a list.
  tap(1);
  expect(expanded()).toEqual(["false", "false"]);
  expect(document.querySelector("dl")).toBeNull();
});

test("the open panel carries the exact totals the row only draws as a bar", () => {
  robot = [record()];
  show();
  tap();

  expect(facts()).toEqual({
    Hands: "146 7.3 a match",
    "Last played": "today",
    Margin: "+641 +4.4 a deal",
    Matches: "20 played 13–7",
    Points: "12,430 for 11,789 against",
    // Pinned at 1200 against a rating of 1514, so it is said to be below.
    Rating: "1200below you",
  });
});

/**
 * The history is capped server-side, so the number of matches shown is not the
 * number played. Saying so is the difference between a partial list and a wrong one.
 */
test("the panel admits how much of the history it is not showing", () => {
  robot = [record()];
  show();
  tap();

  expect(rowText()).toContain("890–410");
  expect(rowText()).toContain("620–980");
  // 20 played, 2 sent.
  expect(rowText()).toContain("18 older matches not shown");
});

test("a server too old to send any history leaves the rest of the panel alone", () => {
  robot = [record({ matches: [] })];
  show();
  tap();

  expect(facts()["Points"]).toBe("12,430 for 11,789 against");
  expect(rowText()).not.toContain("every match");
  expect(rowText()).not.toContain("not shown");
});

/**
 * The one chart in the app, and the only series here that is not noise: a rating
 * moves by K times the surprise, so it is bounded and evenly spaced by match, where
 * a per-match points margin is a random walk.
 */
test("the rating line is drawn, with its reference and its caveats", () => {
  robot = [record()];
  show();

  const svg = document.querySelector("svg.w-full");
  expect(svg, "no rating line").not.toBeNull();

  // One point per match.
  const path = svg!.querySelector("path")?.getAttribute("d") ?? "";
  expect(path.split(/[ML]/).filter((part) => part.trim() !== "")).toHaveLength(HISTORY.length);

  // The reference is 1500 — the one that lands inside the data. The computer's own
  // anchor was tried and squashes the line when the player is clear of it.
  expect(svg!.textContent).toContain("1500");
  // The opening stretch is an artefact of starting everyone at 1500, and says so.
  expect(svg!.textContent).toContain("SETTLING");
  // And the tick where the opponent stopped being the same opponent.
  expect(svg!.textContent).toContain("v2");
});

test("the headline says how far it has moved lately, as a number", () => {
  robot = [record()];
  show();
  // 1514 now against 1451 five matches back. The spans are flex items, so the
  // rendered text runs together — the figure and its unit are what matter.
  expect(rowText().replace(/\s+/g, "")).toContain("+63over5");
});
