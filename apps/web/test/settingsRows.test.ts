// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
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

/**
 * Every section starts collapsed — see `SettingsSection`'s own doc — so a row
 * reachability check has to open them first. Every closed section rather than
 * naming one, so this stays correct if a row ever moves to a different group.
 */
function openAllSections(): void {
  act(() => {
    for (const button of document.querySelectorAll('button[aria-expanded="false"]')) {
      (button as HTMLButtonElement).click();
    }
  });
}

function settings(playtester: boolean): SettingsOverlayProps {
  const noop = (): void => {};
  return {
    account: null,
    boldness: "normal",
    cardColor: "gold",
    density: "normal",
    devTools: false,
    disguise: true,
    difficulty: "championship",
  sessionOrder: "halves",
  onSessionOrderChange: () => {},
    opponent: 3,
    onAccountSaved: noop,
    onAccountDeleted: noop,
    onBoldnessChange: noop,
    onCardColorChange: noop,
    onClose: noop,
    onDensityChange: noop,
    onDevToolsChange: noop,
    onDifficultyChange: noop,
    onDisguiseChange: noop,
    onLeaderboardVisibilityChange: noop,
    onOpponentChange: noop,
    onPaceChange: noop,
    onPeekingChange: noop,
    onShowSignIn: noop,
    onSignOut: noop,
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
  // Moved here from Home, and on this list rather than left off it for the reason
  // the trick count is: it is a matter of taste about a format somebody may not be
  // playing this minute, and a preference nobody can find is not a preference.
  "Order of a duplicate session",
];

test("every ordinary preference is reachable without the playtester flag", () => {
  render(createElement(SettingsOverlay, settings(false)));
  openAllSections();

  for (const label of ORDINARY) {
    expect(screen.queryByText(label), `"${label}" is not on the settings screen`).not.toBeNull();
  }
  // The anti-vacuity half: this really is the ungated screen, so the panel whose
  // rows are deliberately hidden is in fact hidden.
  expect(screen.queryByText("Testing only")).toBeNull();
});

test("the playtester panel adds rows rather than moving them", () => {
  render(createElement(SettingsOverlay, settings(true)));
  openAllSections();

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

/**
 * Account info sits at the top of this one screen now — see `SettingsOverlay`'s
 * own doc for why — and it has to degrade to a sign-in prompt when there is no
 * account to show fields for, the same as `Achievements`/`Record` already do.
 */
test("the account section prompts to sign in when signed out", () => {
  render(createElement(SettingsOverlay, { ...settings(false), account: null }));
  openAllSections();

  expect(screen.queryByText("Sign in")).not.toBeNull();
  expect(screen.queryByText("Signed in as")).toBeNull();
});

test("the account section shows the real fields when signed in", () => {
  render(
    createElement(SettingsOverlay, {
      ...settings(false),
      account: { email: "eric@example.com", hideFromLeaderboard: false, name: "Eric" },
    }),
  );
  openAllSections();

  expect(screen.queryByText("Signed in as")).not.toBeNull();
  expect(screen.queryByText("Hide my name on the leaderboard")).not.toBeNull();
  expect(screen.queryByText("Sign in")).toBeNull();
});

/** Collapsed is the whole point — a screen with this many settings should not open onto all of them. */
test("every section starts collapsed", () => {
  render(
    createElement(SettingsOverlay, {
      ...settings(true),
      account: { email: "eric@example.com", hideFromLeaderboard: false, name: "Eric" },
    }),
  );

  for (const heading of ["Account", "Gameplay", "Display", "Sound & pace", "Testing only"]) {
    expect(screen.queryByText(heading), `"${heading}"'s own heading is missing`).not.toBeNull();
  }
  // The rows underneath are not, since nothing has been opened yet.
  for (const label of [...ORDINARY, "Signed in as", "Hockey theme"]) {
    expect(screen.queryByText(label), `"${label}" is visible before its section opened`).toBeNull();
  }
});

/**
 * A link that promised a particular row — the duplicate order mention on Home
 * and in a session — has to land on that row already open, not merely on the
 * screen it happens to live on.
 */
test("a requested section opens already expanded, the rest stay closed", () => {
  render(createElement(SettingsOverlay, { ...settings(false), initialSection: "gameplay" }));

  expect(screen.queryByText("Order of a duplicate session")).not.toBeNull();
  // Nothing else asked for is open, so its rows stay hidden.
  expect(screen.queryByText("Game speed")).toBeNull();
});

test("the gear icon's own plain open asks for nothing, so everything starts closed", () => {
  render(createElement(SettingsOverlay, settings(false)));

  expect(screen.queryByText("Order of a duplicate session")).toBeNull();
});
