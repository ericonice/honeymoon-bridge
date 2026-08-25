// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Standing, Standings } from "../src/game/standings.js";
import { Record } from "../src/ui/Record.js";

const person = (over: Partial<Standing> = {}): Standing => ({
  difficulty: null,
  name: "Ada",
  played: 31,
  rank: 1,
  rating: 1514,
  version: null,
  you: false,
  ...over,
});

const computer = (difficulty: string, rating: number): Standing => ({
  difficulty,
  name: null,
  played: null,
  rank: null,
  rating,
  version: 3,
  you: false,
});

const BOARD: Standings = {
  of: 2,
  ranked: [
    person({ name: "Ada", rank: 1, rating: 1514, you: true }),
    computer("championship", 1400),
    person({ name: "Noah", played: 22, rank: 2, rating: 1290 }),
    computer("club", 1200),
    computer("kitchen", 1050),
  ],
  settledAfter: 10,
  settling: [person({ name: "Newcomer", played: 2, rank: null, rating: 1523 })],
};

/** What `useStandings` was last asked, which is what makes the fetch lazy. */
let asked: boolean[] = [];
let board: Standings | null = BOARD;
let rank: { readonly of: number | null; readonly rank: number | null } = { of: 9, rank: 3 };

vi.mock("../src/game/standings.js", () => ({
  useStandings: (active: boolean) => {
    asked.push(active);
    return { loading: false, standings: active ? board : null };
  },
}));

vi.mock("../src/game/records.js", () => ({
  resetRecord: vi.fn(),
  useRecentMatches: () => ({ loading: false, matches: [] }),
  useRecords: () => ({
    loading: false,
    records: {
      opponents: [],
      rating: { history: [], of: rank.of, played: 31, rank: rank.rank, value: 1514 },
      // One opponent, because the rating block only exists on a record with
      // something in it — an empty record says so instead, and rightly.
      robot: [
        {
          deals: 146,
          format: "rubber",
          lastPlayed: Date.now(),
          lost: 7,
          matches: [],
          name: "Computer",
          opponentKey: "bot",
          pointsAgainst: 11_789,
          pointsFor: 12_430,
          rating: 1400,
          won: 13,
        },
      ],
    },
    reload: vi.fn(),
  }),
  STARTING_RATING: 1500,
  knownRatings: () => ({ bot: 1200, mine: 1514 }),
  rememberRatings: vi.fn(),
}));

beforeEach(() => {
  asked = [];
  board = BOARD;
  rank = { of: 9, rank: 3 };
});

afterEach(cleanup);

function show(): void {
  render(createElement(Record, { onBack: () => {}, onSignIn: () => {}, signedIn: true }));
}

const text = (): string => (document.body.textContent ?? "").replace(/\s+/g, " ");

/** Both halves of the switch, in the order they are drawn. */
function tabs(): readonly HTMLElement[] {
  return [...document.querySelectorAll("button[aria-pressed]")] as HTMLElement[];
}

function choose(label: string): void {
  const tab = tabs().find((button) => button.textContent === label);
  act(() => {
    tab?.click();
  });
}

/**
 * Each board row, as its own cells — the gaps are flex, so the raw text of a row
 * runs every figure together.
 *
 * The row's own children rather than every span inside it: the name cell holds a
 * nested span for "· you", and collecting only leaves would drop the name.
 */
function lines(): readonly string[] {
  return [...document.querySelectorAll('[class~="items-baseline"][class~="py-1.5"]')].map((row) =>
    [...row.querySelectorAll(":scope > span")]
      .map((span) => (span.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((part) => part !== "")
      .join(" "),
  );
}

test("the screen opens on your own record, and the switch says which half is showing", () => {
  show();

  expect(text()).toContain("Your record");
  expect(tabs().map((tab) => tab.textContent)).toEqual(["You", "Everyone"]);
  expect(tabs().map((tab) => tab.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
});

/**
 * The whole reason the board is a view rather than a section: somebody checking
 * their own win-loss should not pay for a global rating walk and everybody else's
 * rows. If this stops being lazy, that argument is gone and nothing else says so.
 */
test("the standings are not asked for until somebody looks at them", () => {
  show();

  expect(asked).not.toContain(true);

  choose("Everyone");
  expect(asked).toContain(true);
});

test("the heading follows the view, so the first-person voice stays on the first-person half", () => {
  show();
  const heading = (): string => document.querySelector("h1")?.textContent?.trim() ?? "";

  expect(heading()).toBe("Your record");
  choose("Everyone");
  expect(heading()).toBe("Standings");
  choose("You");
  expect(heading()).toBe("Your record");
});

test("the board ranks the people and interleaves the computer unranked", () => {
  show();
  choose("Everyone");

  // Every row of the board in order, the settling one last — a computer between
  // two players does not push the second of them down to third.
  expect(lines()).toEqual([
    "1 Ada · you 1514 31",
    "The computer · Championship 1400",
    "2 Noah 1290 22",
    "The computer · Club 1200",
    "The computer · Kitchen 1050",
    "Newcomer 1523 2",
  ]);
});

/**
 * The releases are named after hockey players and those names appear in Settings
 * and nowhere else — across a board as across a table, the opponent is the
 * computer. What a row needs to say is which rung it is, since that is what a
 * person chose to play.
 */
test("a computer row names its rung and never its release", () => {
  show();
  choose("Everyone");

  expect(text()).toContain("The computer · Championship");
  expect(text()).not.toContain("Bobby");
});

test("a settling rating is listed apart from the ranking, and says why", () => {
  show();
  choose("Everyone");

  expect(text()).toContain("settling");
  expect(text()).toContain("Newcomer");
  // The number that would otherwise be top of the board: one win over the
  // strongest computer, on a rating that is still mostly the starting 1500.
  expect(lines().indexOf("Newcomer 1523 2")).toBeGreaterThan(lines().indexOf("2 Noah 1290 22"));
  expect(text()).toContain("Under 10 rated matches");
});

test("your own rating says where it stands", () => {
  show();

  expect(text()).toContain("3rd of 9");
});

/** Settling, or a server too old to say — either way there is no position to state. */
test("no rank is shown when there is none", () => {
  rank = { of: null, rank: null };
  show();

  expect(text()).not.toContain(" of 9");
  expect(text()).toContain("1514");
});

test("a board that could not be loaded says so rather than showing an empty one", () => {
  board = null;
  show();
  choose("Everyone");

  expect(text()).toContain("Could not load the standings");
});
