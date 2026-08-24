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
 * The order the app asked the network for things, which is the entire subject.
 *
 * A rubber's result is enqueued the moment the match ends and `enqueue` starts
 * sending straight away, so reading the record immediately afterwards is a race.
 * Both orders "work" — nothing throws either way — and the wrong one answers with
 * the record as it stood before the match, until somebody reloads the page.
 *
 * **The first version of this test was vacuous and passed against the bug.** It
 * asserted the order the two requests were *issued* in, which is report-then-read
 * either way, because the send is started synchronously by `enqueue` before the
 * screen ever asks for anything. What actually distinguishes the two is whether
 * the read waits for the report's *response*. So the report is held open here and
 * the assertion is that nothing reads while it is in flight — which fails if the
 * `flush()` in `useRecords` is removed, and that was checked rather than assumed.
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("the record is not read while the rubber just played is still in flight", async () => {
  reportRobotRubber({
    botVersion: 2,
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

  // The report has gone out and the server has not answered it yet. Reading the
  // record now is what returned the pre-match record.
  expect(calls).toEqual(["report"]);

  deliverReport?.();
  await settle();

  expect(calls).toEqual(["report", "read"]);
});

test("with nothing queued the record is still read", async () => {
  await act(async () => {
    render(createElement(Reader));
  });

  expect(calls).toEqual(["read"]);
});
