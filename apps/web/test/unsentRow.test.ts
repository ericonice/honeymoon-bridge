// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SettingsOverlay } from "../src/ui/SettingsOverlay.js";

vi.mock("../src/game/account.js", () => ({
  storedSession: (): string | null => null,
  useAccount: () => ({ account: null, signOut: () => {} }),
}));

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A report the server read and refused, and one still waiting out a tunnel. */
function seedOutbox(): void {
  window.localStorage.setItem(
    "hb.outbox",
    JSON.stringify([
      {
        attempts: 3,
        body: "{}",
        id: "refused",
        kind: "rubber",
        permanent: true,
        queuedAt: Date.now() - 60_000,
        status: "400",
        url: "/api/results",
      },
      {
        attempts: 1,
        body: "{}",
        id: "waiting",
        kind: "hands",
        permanent: false,
        queuedAt: Date.now() - 60_000,
        status: "offline",
        url: "/api/hands/log",
      },
    ]),
  );
}

function buttonMatching(pattern: RegExp): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((one) =>
    pattern.test(one.textContent ?? ""),
  );
}

function showSettings(): void {
  render(
    createElement(SettingsOverlay, {
      account: null,
      onAccountSaved: () => {},
      onAccountDeleted: () => {},
      onClose: () => {},
      onLeaderboardVisibilityChange: () => {},
      onShowRecord: () => {},
      onShowSignIn: () => {},
      onSignOut: () => {},
    } as never),
  );
}

/**
 * The dead end this closes. `drain` skips a report the server has refused, so "Try
 * again now" can never move one — without a way out the footer says a result was never
 * filed for the life of the browser and nothing clears it.
 *
 * Ungated on purpose, so this renders without the playtester flag: the person who needs
 * it is whoever lost the game, which is the same argument that keeps the row it sits in
 * out of the testing panel.
 */
test("a report that can never be sent can be discarded", () => {
  seedOutbox();
  showSettings();

  expect(buttonMatching(/Try again now/)).toBeDefined();
  const discard = buttonMatching(/Discard/);
  expect(discard, "no way out of a permanently refused report").toBeDefined();
  expect(discard!.textContent).toContain("the one that cannot be sent");

  discard!.click();

  const left = JSON.parse(window.localStorage.getItem("hb.outbox") ?? "[]") as { id: string }[];
  expect(left.map((one) => one.id), "the one still trying was thrown away too").toEqual([
    "waiting",
  ]);
});

/** Nothing to escape from, so nothing offered — it is a way out, not a tidy-up. */
test("nothing to discard when every report is still trying", () => {
  window.localStorage.setItem(
    "hb.outbox",
    JSON.stringify([
      {
        attempts: 1,
        body: "{}",
        id: "waiting",
        kind: "hands",
        permanent: false,
        queuedAt: Date.now(),
        status: "offline",
        url: "/api/hands/log",
      },
    ]),
  );
  showSettings();

  expect(buttonMatching(/Try again now/), "the outbox row did not render at all").toBeDefined();
  expect(buttonMatching(/Discard/)).toBeUndefined();
});
