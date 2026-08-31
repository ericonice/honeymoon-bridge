// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { AccountFields } from "../src/ui/AccountFields.js";

const setAccountName = vi.fn();
const setHideFromLeaderboard = vi.fn();

vi.mock("../src/game/account.js", () => ({
  setAccountName: (name: string) => setAccountName(name),
  setHideFromLeaderboard: (hidden: boolean) => setHideFromLeaderboard(hidden),
}));

vi.mock("../src/game/identity.js", () => ({
  nickname: () => "",
  setNickname: () => {},
}));

vi.mock("../src/game/records.js", () => ({
  deleteAccount: () => Promise.resolve(true),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function show(
  hideFromLeaderboard: boolean,
  onLeaderboardVisibilityChange: () => void = () => {},
): void {
  render(
    createElement(AccountFields, {
      email: "eric@example.com",
      existing: "Eric",
      hideFromLeaderboard,
      onDeleted: () => {},
      onLeaderboardVisibilityChange,
      onSaved: () => {},
      onSignOut: () => {},
    }),
  );
}

const toggle = (): HTMLButtonElement =>
  document.querySelector('button[aria-pressed]') as HTMLButtonElement;

test("the leaderboard toggle starts at whatever the account already has", () => {
  show(true);
  expect(toggle().getAttribute("aria-pressed")).toBe("true");

  cleanup();
  show(false);
  expect(toggle().getAttribute("aria-pressed")).toBe("false");
});

/**
 * Flipping the toggle calls the leaderboard setting, not the name save — the
 * two are unrelated fields on the same screen, and `onSaved` is also wired to
 * navigate away in the one caller that has somewhere to go, which a toggle
 * must not do.
 */
test("flipping the toggle saves it and reports back, without touching onSaved", async () => {
  setHideFromLeaderboard.mockResolvedValue(true);
  const onLeaderboardVisibilityChange = vi.fn();
  show(false, onLeaderboardVisibilityChange);

  await act(async () => {
    toggle().click();
  });

  expect(setHideFromLeaderboard).toHaveBeenCalledWith(true);
  expect(onLeaderboardVisibilityChange).toHaveBeenCalledTimes(1);
  expect(toggle().getAttribute("aria-pressed")).toBe("true");
});

/** Optimistic, and reverted the moment the server refuses it. */
test("a refused toggle reverts and says why", async () => {
  setHideFromLeaderboard.mockResolvedValue(false);
  show(false);

  await act(async () => {
    toggle().click();
  });

  expect(toggle().getAttribute("aria-pressed")).toBe("false");
  expect(document.body.textContent ?? "").toContain("Could not save that");
});
