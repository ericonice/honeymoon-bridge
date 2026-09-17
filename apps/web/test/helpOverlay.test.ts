// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MatchFormat } from "@hb/engine";
import { createElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { HelpOverlay } from "../src/ui/HelpOverlay.js";

afterEach(cleanup);

/**
 * The bidding tutorial's own entry point — a screen reached from the auction
 * section, on the same footing as Scoring's "What everything is worth".
 */
test("opens the bidding tutorial from the auction section", () => {
  render(createElement(HelpOverlay, { onClose: vi.fn() }));

  fireEvent.click(screen.getByText("The auction"));
  fireEvent.click(screen.getByText("Learning to bid"));

  expect(screen.getByText("Step 1 of 12")).toBeTruthy();
});

/**
 * Where a format is explained, one heading per format the app can play.
 *
 * **Keyed on `MatchFormat` so a new format fails to compile rather than shipping
 * undocumented.** Field shipped, was played, was renamed to Doop and was deployed
 * before this screen said a word about it — help is the one surface with nothing
 * that breaks when it falls behind, so the only thing that can hold it to the app
 * is a list the compiler checks.
 *
 * A rubber and a single game share Scoring, which is the honest mapping rather than
 * a gap: they are the same game at two lengths, which is exactly what that section
 * says.
 */
const EXPLAINED_UNDER: Record<MatchFormat, string> = {
  duplicate: "Duplicate: Replay",
  field: "Duplicate: Doop",
  game: "Scoring",
  mirror: "Mirror",
  rubber: "Scoring",
};

test("explains every format the app can play", () => {
  render(createElement(HelpOverlay, { onClose: vi.fn() }));

  for (const heading of new Set(Object.values(EXPLAINED_UNDER))) {
    expect(screen.getByText(heading)).toBeTruthy();
  }
});

/**
 * Doop is a word nobody can work out from the board, which is the one thing on this
 * screen that has to be *told* rather than met while playing. The rest of the
 * section is rules somebody runs into; this is a name.
 *
 * Asserted as reachable — opened from a collapsed section — rather than merely
 * present in the source, since every section here starts shut.
 */
test("says what Doop means, and how a board is scored", () => {
  render(createElement(HelpOverlay, { onClose: vi.fn() }));

  fireEvent.click(screen.getByText("Duplicate: Doop"));

  expect(screen.getByText("What the word means")).toBeTruthy();
  expect(screen.getByText("You are scored on where you come, not on how much")).toBeTruthy();
  // The field is the hint, so the rule that withholds it is the one a reader most
  // needs — and it is the one §1.8a enforces server-side.
  expect(screen.getByText("The field is hidden until you have played")).toBeTruthy();
});
