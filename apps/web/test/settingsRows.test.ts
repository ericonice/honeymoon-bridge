// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { SettingsOverlay } from "../src/ui/SettingsOverlay.js";
import type { SettingsOverlayProps } from "../src/ui/SettingsOverlay.js";

vi.mock("../src/game/soundEffects.js", () => ({
  playAchievement: vi.fn(),
  playCall: vi.fn(),
  playCardPlayed: vi.fn(),
  playDealOutcome: vi.fn(),
  playDrawResolve: vi.fn(),
  playRubberWon: vi.fn(),
}));

afterEach(cleanup);

function settings(playtester: boolean): SettingsOverlayProps {
  const noop = (): void => {};
  return {
    boldness: "normal",
    cardColor: "gold",
    density: "normal",
    devTools: false,
    disguise: true,
    difficulty: "championship",
    opponent: 3,
    onBoldnessChange: noop,
    onCardColorChange: noop,
    onClose: noop,
    onDensityChange: noop,
    onDevToolsChange: noop,
    onDifficultyChange: noop,
    onDisguiseChange: noop,
    onOpponentChange: noop,
    onPaceChange: noop,
    onPeekingChange: noop,
    onShowHelp: noop,
    onSoundChange: noop,
    onTapToSelectChange: noop,
    onThemeChange: noop,
    onTrickCountChange: noop,
    pace: "fast",
    peeking: false,
    playtester,
    sound: true,
    tapToSelect: false,
    theme: "hockey",
    trickCount: true,
  };
}

/**
 * Every row somebody who is not a playtester must be able to reach.
 *
 * The trick count is on this list because it shipped one release *off* it: the
 * row went into the "Testing only" panel, which is gated on an account flag, so
 * the only people who could turn the countdown off were the ones who had already
 * volunteered for unfinished behavior — that is, nobody the setting exists for.
 *
 * Nothing here is under test in the sense that panel means. These are matters of
 * taste, and a preference nobody can find is not a preference.
 */
const ORDINARY = [
  // Not "Match length": what is being played moved to Home, above the buttons
  // that start a match. `test/homeFormat.test.ts` is what holds it there.
  "Layout",
  "Game speed",
  "Count the tricks each side needs",
  "Sound",
  // How hard it plays is the setting that replaced four, and the one everybody
  // needs. Which *release* they play is a measurement tool and lives behind the
  // flag — it stopped being the difficulty lever the moment there was one.
  "How hard it plays",
];

test("every ordinary preference is reachable without the playtester flag", () => {
  render(createElement(SettingsOverlay, settings(false)));

  for (const label of ORDINARY) {
    expect(screen.queryByText(label), `"${label}" is not on the settings screen`).not.toBeNull();
  }
  // The anti-vacuity half: this really is the ungated screen, so the panel whose
  // rows are deliberately hidden is in fact hidden.
  expect(screen.queryByText("Testing only")).toBeNull();
});

test("the playtester panel adds rows rather than moving them", () => {
  render(createElement(SettingsOverlay, settings(true)));

  expect(screen.queryByText("Testing only")).not.toBeNull();
  for (const label of ORDINARY) {
    expect(screen.queryByText(label), `"${label}" went missing for a playtester`).not.toBeNull();
  }
});

/**
 * The other half of the gate, and the one the reachability test cannot make.
 *
 * These two rows show what *other people* have played — every logged hand and
 * every finished match, by anybody. That is a different permission from "will
 * try unfinished behavior", and the only thing standing between them is that
 * the rows sit inside the panel. So assert they are absent without the flag,
 * rather than trusting the block they happen to be written in.
 */
test("the rows that show other people's games are behind the flag", () => {
  render(createElement(SettingsOverlay, settings(false)));

  for (const label of ["Latest games", "Logged hands"]) {
    expect(screen.queryByText(label), `"${label}" is reachable without the flag`).toBeNull();
  }
});
