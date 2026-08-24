// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, test } from "vitest";
import type { RatingPoint } from "../src/game/records.js";
import { RatingTrend } from "../src/ui/RatingTrend.js";

afterEach(cleanup);

/** A line long enough to draw, at whichever opponents are named. */
function history(versions: readonly (number | null)[]): RatingPoint[] {
  return versions.map((botVersion, index) => ({ botVersion, rating: 1500 + index }));
}

function marks(): string[] {
  return screen
    .queryAllByText(/^v\d+$/)
    .map((node) => node.textContent ?? "")
    .sort();
}

/**
 * Every release change is drawn, and this is the bug that prompted the test.
 *
 * The chart marked the *first* change only, which was indistinguishable from
 * correct for as long as anybody's history contained one. The day v3 shipped, a
 * line spanning v1, v2 and v3 drew the v1-to-v2 rule and silently dropped the one
 * the player had just made.
 */
test("a line spanning three releases marks both changes", () => {
  render(createElement(RatingTrend, { history: history([1, 1, 2, 2, 2, 3, 3, 3]) }));
  expect(marks()).toEqual(["v2", "v3"]);
});

test("one change is still marked once", () => {
  render(createElement(RatingTrend, { history: history([2, 2, 2, 3, 3, 3, 3, 3]) }));
  expect(marks()).toEqual(["v3"]);
});

test("a run against one opponent is marked nowhere", () => {
  render(createElement(RatingTrend, { history: history([3, 3, 3, 3, 3, 3, 3, 3]) }));
  expect(marks()).toEqual([]);
});

/**
 * A person is not a change of opponent strength worth a rule, so a null either
 * side of a version is not an event — only a change between two known bots is.
 */
test("playing a person between two bots is not a release change", () => {
  render(createElement(RatingTrend, { history: history([3, 3, null, null, 3, 3, 3, 3]) }));
  expect(marks()).toEqual([]);
});
