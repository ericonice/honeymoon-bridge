// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createElement, useEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { reportRobotRubber, useRecords } from "../src/game/records.js";

vi.mock("../src/game/account.js", () => ({
  storedSession: (): string | null => "token",
}));

vi.mock("../src/game/identity.js", () => ({
  nickname: (): string => "Someone",
  playerToken: (): string => "device",
}));

/**
 * When the record is read, relative to a report still in flight.
 *
 * A rubber's result is enqueued the moment the match ends, so a read taken
 * straight afterwards answers with the record from before the match. The first fix
 * made the read wait for the send, and that was worse: `outbox.ts` awaits `fetch`
 * with no timeout, so one hanging report held the screen — sometimes for a long
 * while, sometimes forever. **A screen that never appears is a worse bug than a
 * screen showing yesterday's number.**
 *
 * So the contract is: read immediately, and read *again* once the queue has
 * drained. Both halves need asserting. Without the second read the original
 * staleness is back; without the first, the screen can hang.
 */
let calls: string[] = [];

/** Resolves the held report, so the test decides when the server has answered. */
let deliverReport: (() => void) | null = null;

function ok(body: unknown): Response {
  return {
    json: () => Promise.resolve(body),
    ok: true,
    status: 200,
  } as unknown as Response;
}

function fakeNetwork(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (String(url).includes("/results/robot")) {
        calls.push("report");
        return new Promise<Response>((resolve) => {
          deliverReport = () => resolve(ok({}));
        });
      }
      calls.push("read");
      return Promise.resolve(ok({ opponents: [], ratings: [] }));
    }),
  );
}

/** Lets every already-resolved promise settle, without letting time pass. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function Reader(): null {
  const { reload } = useRecords(false);
  useEffect(reload, [reload]);
  return null;
}

beforeEach(() => {
  localStorage.clear();
  calls = [];
  deliverReport = null;
  fakeNetwork();
});

afterEach(async () => {
  // Settle any report left hanging, so the outbox's in-flight pass does not leak
  // into the next test. Worth knowing that this is a real property and not test
  // housekeeping: `flush()` joins the pass already running, so a request that never
  // settles means every later flush joins a promise that never resolves and nothing
  // is ever sent again for the life of the page.
  deliverReport?.();
  await act(async () => {
    await Promise.resolve();
  });
  cleanup();
  vi.unstubAllGlobals();
});

test("the record is read at once, without waiting for the report", async () => {
  reportRobotRubber({
    botVersion: 3,
    difficulty: "championship",
    deals: 8,
    format: "rubber",
    points: 1200,
    pointsAgainst: 300,
    won: true,
  });

  await act(async () => {
    render(createElement(Reader));
  });
  await settle();

  // The report is deliberately left hanging. The screen must not be waiting on it.
  expect(calls).toEqual(["report", "read"]);
});

test("and read again once the report has landed, so it is not left stale", async () => {
  reportRobotRubber({
    botVersion: 3,
    difficulty: "championship",
    deals: 8,
    format: "rubber",
    points: 1200,
    pointsAgainst: 300,
    won: true,
  });

  await act(async () => {
    render(createElement(Reader));
  });
  await settle();
  expect(calls).toEqual(["report", "read"]);

  deliverReport?.();
  await settle();

  expect(calls).toEqual(["report", "read", "read"]);
});

test("with nothing queued the record is still read", async () => {
  await act(async () => {
    render(createElement(Reader));
  });

  expect(calls).toEqual(["read"]);
});
