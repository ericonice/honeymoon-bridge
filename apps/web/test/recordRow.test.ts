// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { MatchRecord, OpponentMatch, OpponentRecord } from "../src/game/records.js";
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
let recent: readonly MatchRecord[] = [];

const played = (over: Partial<MatchRecord> = {}): MatchRecord => ({
  botVersion: 3,
  deals: 8,
  drawn: false,
  finishedAt: Date.UTC(2026, 7, 22, 16, 42),
  format: "rubber",
  opponentName: "Computer",
  pointsAgainst: 410,
  pointsFor: 890,
  won: true,
  ...over,
});

/** Twelve points, with the opponent changing at the fourth — enough to draw. */
const HISTORY = [1470, 1440, 1442, 1444, 1447, 1449, 1451, 1453, 1427, 1434, 1441, 1514].map(
  (rating, index) => ({ botVersion: index < 4 ? 1 : 2, rating }),
);

vi.mock("../src/game/records.js", () => ({
  resetRecord: vi.fn(),
  useRecentMatches: () => ({ loading: false, matches: recent }),
  useRecords: () => ({
    loading: false,
    records: { opponents: [], rating: { history: HISTORY, played: 31, value: 1514 }, robot },
    reload: vi.fn(),
  }),
  STARTING_RATING: 1500,
  knownRatings: () => ({ bot: 1200, mine: 1514 }),
  rememberRatings: vi.fn(),
}));

afterEach(() => {
  cleanup();
  recent = [];
});

function show(): void {
  render(createElement(Record, { onBack: () => {}, onSignIn: () => {}, signedIn: true }));
}

/** The row's text with runs of whitespace flattened, since it is built from spans. */
function rowText(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

/**
 * One opponent row, as its parts — a title line and a detail line, joined in
 * reading order.
 *
 * Joined from the leaf spans rather than read off `textContent`: the row's gaps are
 * flex, not whitespace, so the raw text runs every figure together. Each row is a
 * `button[aria-expanded]`, the same element `rows()` finds — there is no longer a
 * fixed grid position to select on, since neither line reads anything by position.
 */
function lines(): readonly string[] {
  return rows().map((row) =>
    [...row.querySelectorAll("span")]
      .filter((span) => span.children.length === 0)
      .map((span) => (span.textContent ?? "").trim())
      .filter((text) => text !== "")
      .join(" "),
  );
}

/**
 * There is no column header above this list any more, and there is nothing to
 * assert about it — a header names positions, and neither row reads anything
 * by position. See `OpponentSummaryLine`'s own doc for why.
 */
test("an opponent is a title line and a detail line", () => {
  robot = [record()];
  show();

  expect(lines()).toHaveLength(1);
  // The margin sits on the title line now, beside the name, rather than at
  // the end of a row of columns — it is the one figure worth a glance. No
  // points bar and no for/against text: the summary row folds every format
  // together, and there is no real pair left to draw a proportion of once
  // they are pooled — see `combinedOf`.
  expect(lines()[0]).toBe("Computer 1200 cpu +641 13–7 · 146 hands");
});

/**
 * The sparkline is the only thing on a format row that draws the match
 * history, and it draws the *cumulative* margin across it rather than a
 * proportion of one pair of totals — so it can say whether a lead has been
 * widening or shrinking, which a single ratio never could.
 *
 * Only reachable one drill-down in: the summary row that lists first never has
 * a pair to show, since it is every format pooled together — see `combinedOf`.
 */
test("a format row draws a sparkline of the cumulative margin, oldest to newest", () => {
  robot = [
    record({ format: "mirror" }),
    record({
      deals: 4,
      format: "duplicate",
      lost: 0,
      // Oldest first as passed here; the row reverses to draw oldest-to-newest.
      matches: [
        match({ pointsAgainst: 50, pointsFor: 20 }), // newest: down 30
        match({ pointsAgainst: 20, pointsFor: 200 }), // oldest: up 180
      ],
      pointsAgainst: 70,
      pointsFor: 220,
      won: 1,
    }),
  ];
  show();
  tap();

  const [mirrorRow, duplicateRow] = rows().slice(1);
  expect(mirrorRow!.querySelector('svg[width="60"]')).not.toBeNull();
  // Ahead by 180 after the older match, behind by 30 after the newer one, but
  // still ahead overall — the final point is what colours the line.
  expect(duplicateRow!.querySelector('[class~="stroke-emerald-300"]')).not.toBeNull();
});

/**
 * A lone match has no direction to draw, only a result the margin figure already
 * states. This used to matter for a second reason too: a fixed six-column grid
 * with no explicit `grid-column` on any child let a missing sparkline shift
 * everything after it into the wrong track. A title line and a detail line has
 * no tracks to shift — the row still has exactly two lines whether or not the
 * second one carries a sparkline — which is the property this now checks.
 */
test("a format row with fewer than two matches draws no sparkline, and its row still has two lines", () => {
  robot = [
    record({ format: "mirror" }),
    record({ deals: 8, format: "duplicate", lost: 0, matches: [match()], won: 1 }),
  ];
  show();
  tap();

  const [, duplicateRow] = rows().slice(1);
  expect(duplicateRow!.querySelector('svg[width="60"]')).toBeNull();
  expect(duplicateRow!.children).toHaveLength(2);
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

/**
 * **The name is said once, on the summary row, whatever it drills down into.**
 *
 * It belongs to the opponent rather than to a format, and repeating it on each
 * one is what squeezed it: the first column is about 120px of a 336px screen,
 * and a split opponent's row was carrying a name, a `cpu` badge and a tag
 * reading "mirror matches" — so the name, the one thing there that identifies
 * anybody, was the part that truncated. Reported exactly that way.
 *
 * The cost is a line for an opponent who plays two formats — the summary row —
 * which buys back the whole column underneath it for whatever a format row is
 * actually distinguishing.
 */
test("an opponent played in both formats names them, on a line each", () => {
  robot = [record(), record({ deals: 9, format: "mirror", lost: 1, pointsAgainst: 200, pointsFor: 290, won: 2 })];
  show();
  tap();

  expect(lines()).toEqual([
    "Computer 1200 cpu +731 15–8 · 155 hands",
    "rubbers +641 13–7 · 146 hands",
    "mirror matches +90 2–1 · 9 hands",
  ]);
});

/**
 * And an opponent with one format keeps the whole column for their name, which was
 * the other half of the complaint: a long name truncated with nothing competing
 * with it at all. There is nothing to tell apart, so there is no heading and no tag.
 */
test("an opponent played in one format is still a single line", () => {
  robot = [record({ name: "Christopher" })];
  show();

  expect(lines()).toHaveLength(1);
  expect(lines()[0]).toContain("Christopher");
  expect(rowText()).not.toContain("rubbers");
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
    record({ deals: 9, format: "mirror", lost: 1, pointsAgainst: 200, pointsFor: 290, won: 2 }),
    record({ deals: 20, format: "duplicate", lost: 1, pointsAgainst: 0, pointsFor: 340, won: 1 }),
  ];
  show();
  tap();

  expect(lines()).toEqual([
    "Computer 1200 cpu +1,071 16–9 · 175 hands",
    "rubbers +641 13–7 · 146 hands",
    "mirror matches +90 2–1 · 9 hands",
    "duplicate sessions +340 1–1 · 20 hands",
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

/**
 * A drawn record's three-figure string is the longest thing this column ever
 * holds, and jsdom cannot see whether it actually wraps — but it can see whether
 * the column still says it must not, which is what stops a row with a draw
 * silently growing back to two lines.
 */
test("a drawn record's win-loss-draw figure does not wrap", () => {
  robot = [record({ drawn: 1, lost: 28, won: 42 })];
  show();

  const [figure] = [...document.querySelectorAll("span")].filter(
    (span) => (span.textContent ?? "").trim() === "42–28–1",
  );
  expect(figure?.className).toContain("whitespace-nowrap");
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

test("a record with nothing in it yet shows a level line rather than dividing by zero", () => {
  robot = [record({ deals: 0, lost: 0, pointsAgainst: 0, pointsFor: 0, won: 0 })];
  show();

  expect(lines()[0]).toContain("0–0");
  expect(lines()[0]).toContain("+0");
  expect(rowText()).not.toContain("NaN");
});

/**
 * Every match netting to zero is the sparkline's own zero-division case — the
 * highest and lowest points on the line are both zero, so the span a share
 * would divide by is nothing. Checked with real matches rather than none, since
 * a single-format opponent never reaches a format row's sparkline at all.
 */
test("a sparkline of an entirely level run of matches draws a flat line rather than NaN", () => {
  robot = [
    record({ format: "mirror" }),
    record({
      deals: 4,
      format: "duplicate",
      lost: 1,
      matches: [match({ pointsAgainst: 0, pointsFor: 0 }), match({ pointsAgainst: 0, pointsFor: 0 })],
      pointsAgainst: 0,
      pointsFor: 0,
      won: 0,
    }),
  ];
  show();
  tap();

  const [, duplicateRow] = rows().slice(1);
  expect(duplicateRow!.querySelector('svg[width="60"]')).not.toBeNull();
  expect(duplicateRow!.textContent).not.toContain("NaN");
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

/** Opens the "Recent matches" section, which is collapsed by default. */
function openRecentMatches(): void {
  act(() => {
    screen.getByText("Recent matches").closest("button")!.click();
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
 *
 * Two levels deep now: the opponent's own row opens onto its formats, and a
 * format row opens onto its detail — each one open at a time, at its own depth.
 */
test("a row says whether it is open, and only one is", () => {
  robot = [record(), record({ deals: 9, format: "game", lost: 1, pointsAgainst: 200, pointsFor: 290, won: 2 })];
  show();

  const expanded = (): (string | null)[] =>
    rows().map((row) => row.getAttribute("aria-expanded"));

  expect(expanded()).toEqual(["false"]);
  expect(document.querySelector("dl")).toBeNull();

  // Opens onto the two formats — neither of their panels is open yet.
  tap(0);
  expect(expanded()).toEqual(["true", "false", "false"]);

  tap(1);
  expect(expanded()).toEqual(["true", "true", "false"]);

  // Opening another closes the first: a panel breaks the column alignment where it
  // sits, so two at once would leave the list looking like the sentence it replaced.
  tap(2);
  expect(expanded()).toEqual(["true", "false", "true"]);

  // The open format panel closes, stepping back up to the format list rather
  // than collapsing the opponent — that list is still where the reader was.
  tap(2);
  expect(expanded()).toEqual(["true", "false", "false"]);
  expect(document.querySelector("dl")).toBeNull();

  // And the opponent's own row closes the whole thing, which is the only way
  // back to a list that is a list.
  tap(0);
  expect(expanded()).toEqual(["false"]);
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
  });
});

/**
 * A rubber and a single game read the same "won" and "lost" on the row above —
 * that is the whole point of combining them — so the split lives only here, where
 * there is room to say which was which.
 */
test("a combined rubber record breaks itself down by length in the panel", () => {
  robot = [
    record({
      byLength: {
        game: { deals: 9, drawn: 0, lost: 1, won: 2 },
        rubber: { deals: 137, drawn: 0, lost: 6, won: 11 },
      },
    }),
  ];
  show();
  tap();

  expect(facts()).toMatchObject({
    Rubbers: "11–6 137 deals",
    "Single games": "2–1 9 deals",
  });
});

test("a record with only one length says nothing about the split", () => {
  robot = [record()];
  show();
  tap();

  expect(facts()).not.toHaveProperty("Rubbers");
  expect(facts()).not.toHaveProperty("Single games");
});

/**
 * **A duplicate session has a real for/against pair now, the same as any other
 * format.** `DuplicateSummary.points` sums the genuine two-sided score
 * `DuplicateDealScore` already computes — honors and undertrick penalties
 * included, not the signed margin `DuplicateResult.points` collapses a run to
 * — so the "Points" fact and each match's pair draw it exactly like a
 * rubber's or a mirror's. (Its sparkline drawing the same way as any other
 * format's is covered directly above.)
 */
test("a duplicate panel states the real pair, the same as a rubber's", () => {
  robot = [record({ deals: 60, format: "duplicate", lost: 0, pointsAgainst: 290, pointsFor: 320, won: 1 })];
  show();
  tap();

  expect(facts().Points).toContain("320");
  expect(facts().Points).toContain("290");
  expect(facts().Margin).toContain("+30");
});

test("a duplicate match in the history shows its real pair, not a fabricated one", () => {
  robot = [
    record({
      deals: 60,
      format: "duplicate",
      lost: 0,
      matches: [match({ deals: 20, format: "duplicate", pointsAgainst: 290, pointsFor: 320 })],
      pointsAgainst: 290,
      pointsFor: 320,
      won: 1,
    }),
  ];
  show();
  tap();

  expect(rowText()).toContain("320–290");
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

/**
 * A match in the panel's history is a title line (result and score) and a
 * detail line (when, and how many deals) under it now, rather than a table row
 * — so the timestamp has a full-width line to itself and needs no splitting.
 * `whitespace-nowrap` stays as the guard for whatever row this ends up in next.
 */
test("a match in the panel's history states its full timestamp on one line", () => {
  robot = [record()];
  show();
  tap();

  const stamp = [...document.querySelectorAll("span")].find(
    (span) => span.children.length === 0 && (span.textContent ?? "").startsWith("Aug 22"),
  );
  expect(stamp, "no timestamp found").not.toBeUndefined();
  expect(stamp!.className).toContain("whitespace-nowrap");
  expect(stamp!.textContent).toMatch(/^Aug 22, \d{1,2}:\d{2}/);
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

/**
 * **A match names its format, and a mirror is why this needed saying.**
 *
 * The line already carried `matchNoun`, which answers a different question — what
 * to call the thing while you play it. For a mirror the honest answer there is
 * "match", which is precisely the general word this app uses for all four, so on a
 * list headed "Recent matches" that row said only that it was one.
 */
test("a recent match says which format it was", () => {
  robot = [record()];
  recent = [
    played({ format: "mirror" }),
    played({ finishedAt: Date.UTC(2026, 7, 21, 9, 0), format: "duplicate" }),
    played({ finishedAt: Date.UTC(2026, 7, 20, 9, 0), format: "game" }),
    played({ finishedAt: Date.UTC(2026, 7, 19, 9, 0) }),
  ];
  show();
  openRecentMatches();

  const text = rowText();
  for (const named of ["Mirror · 8 deals", "Duplicate · 8 deals", "Single game · 8 deals", "Rubber · 8 deals"]) {
    expect(text, `no row reads "${named}"`).toContain(named);
  }
});

/**
 * Collapsed by default: up to twenty matches at two lines each is a real
 * scroll for something that is supplementary detail once the tallies above
 * already say how things stand.
 */
test("recent matches start collapsed and open on a tap", () => {
  robot = [record()];
  recent = [played()];
  show();

  const button = screen.getByText("Recent matches").closest("button")!;
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(rowText()).not.toContain("vs Computer");

  openRecentMatches();
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(rowText()).toContain("vs Computer");
});

/**
 * A recent duplicate match draws its real pair too, the same as any other
 * format — `MatchRecord` gets it from the same `DuplicateSummary.points` as
 * everything else on this screen, so there is nothing left for this
 * component, or the opponent panel's own history list, to special-case.
 */
test("a recent duplicate match shows its real pair", () => {
  robot = [record()];
  recent = [played({ format: "duplicate", pointsAgainst: 290, pointsFor: 320 })];
  show();
  openRecentMatches();

  expect(rowText()).toContain("320–290");
});
