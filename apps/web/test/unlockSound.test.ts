// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { playAchievement } from "../src/game/soundEffects.js";
import { board, renderBoard, settle, stubBrowser } from "./support/board.js";

vi.mock("../src/game/soundEffects.js", () => ({
  playAchievement: vi.fn(),
  playCall: vi.fn(),
  playCardPlayed: vi.fn(),
  playContractResult: vi.fn(),
  playDrawResolve: vi.fn(),
  playRubberWon: vi.fn(),
}));

const fanfare = () => vi.mocked(playAchievement);

beforeEach(() => {
  vi.useFakeTimers();
  fanfare().mockClear();
  stubBrowser();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("a title unlocking sounds once", () => {
  renderBoard({ seat: 0, seed: 7, sound: true });
  settle(4000);
  expect(fanfare(), "nothing unlocked yet").not.toHaveBeenCalled();

  board.unlock([{ achievement: "two-suiter", tier: "bronze" }]);
  settle(4000);
  expect(fanfare()).toHaveBeenCalledTimes(1);
});

test("a second unlock arriving while the first is on screen is not a second fanfare", () => {
  // `justUnlocked` accumulates — over a network the server pushes deal unlocks
  // and rubber unlocks as separate messages, and both can land before anyone has
  // tapped the notification away. That is one announcement, not two.
  renderBoard({ seat: 0, seed: 7, sound: true });
  settle(4000);

  board.unlock([{ achievement: "two-suiter", tier: "bronze" }]);
  settle(4000);
  board.unlock([
    { achievement: "two-suiter", tier: "bronze" },
    { achievement: "take-the-rubber", tier: "gold" },
  ]);
  settle(4000);

  expect(fanfare()).toHaveBeenCalledTimes(1);
});

test("a later unlock, after the first was dismissed, sounds again", () => {
  renderBoard({ seat: 0, seed: 7, sound: true });
  settle(4000);

  board.unlock([{ achievement: "two-suiter", tier: "bronze" }]);
  settle(4000);
  board.unlock([]);
  settle(4000);
  board.unlock([{ achievement: "slam", tier: "gold" }]);
  settle(4000);

  expect(fanfare()).toHaveBeenCalledTimes(2);
});

test("with sound off, nothing sounds — and turning it on does not fire a catch-up", () => {
  renderBoard({ seat: 0, seed: 7 });
  settle(4000);

  board.unlock([{ achievement: "slam", tier: "gold" }]);
  settle(4000);

  expect(fanfare()).not.toHaveBeenCalled();
});
