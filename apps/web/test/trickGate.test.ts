// @vitest-environment jsdom
import { applyTableAction, startTable } from "@hb/engine";
import type { DealAction, PlayerId } from "@hb/engine";
import { legalActionsForView } from "@hb/engine";
import { snapshotFor } from "@hb/protocol";
import type { SessionSnapshot } from "@hb/protocol";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { trickStageTime } from "../src/game/timing.js";
import { landsOnResolvedTrick, useTrickGate } from "../src/game/trickGate.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * A whole deal as one seat is told about it, one snapshot per action.
 *
 * Real snapshots rather than constructed ones, because what is being tested is a
 * rule about the shape the server actually sends — a hand-built object would agree
 * with the predicate by construction and say nothing about whether the predicate
 * describes anything.
 *
 * The auction opens the cheapest contract rather than taking the first legal
 * action, which passes every deal out, or the last, which climbs to seven
 * no-trump: both are dead ends `returnMatch.test.ts` already walked into.
 */
function dealAsSeen(seat: PlayerId): SessionSnapshot[] {
  let table = startTable({ seed: 7, starter: 0 });
  const seen: SessionSnapshot[] = [];
  for (let step = 0; step < 400 && table.deal.phase !== "complete"; step += 1) {
    const actor = table.deal.toAct;
    const view = snapshotFor({ kind: "rubber", table }, actor).view;
    const legal = legalActionsForView(view).filter((action) => action.type !== "claim");
    const opening = legal.find(
      (action) => action.type === "call" && action.call.type === "bid",
    );
    const passing = legal.find((action) => action.type === "call" && action.call.type === "pass");
    const action: DealAction =
      table.deal.phase !== "auction"
        ? legal[0]!
        : ((view.auction.length === 0 ? opening : passing) ?? legal[0]!);
    table = applyTableAction(table, actor, action);
    seen.push(snapshotFor({ kind: "rubber", table }, seat));
  }
  return seen;
}

/** Whether this snapshot is a resolved trick lying on the table. */
function lying(snapshot: SessionSnapshot): boolean {
  return (
    snapshot.view.phase === "play" &&
    snapshot.view.currentTrick.length === 0 &&
    snapshot.view.completedTricks.length > 0
  );
}

/** The first place the opponent leads past a trick that has just resolved. */
function theirLeadPastATrick(seen: readonly SessionSnapshot[]): number {
  const at = seen.findIndex(
    (snapshot, index) =>
      index > 0 &&
      lying(snapshot) &&
      seen[index + 1] !== undefined &&
      landsOnResolvedTrick(snapshot, seen[index + 1]!),
  );
  expect(at, "no deal in this walk had the opponent lead past a resolved trick").toBeGreaterThan(0);
  return at;
}

test("the opponent's lead waits for the trick it is leading past", () => {
  const seen = dealAsSeen(0);
  const at = theirLeadPastATrick(seen);
  const { result } = renderHook(() => useTrickGate());

  act(() => {
    result.current.receive(seen[at - 1]!);
    result.current.receive(seen[at]!);
  });
  expect(result.current.awaitingDismissal).toBe(true);

  act(() => {
    result.current.receive(seen[at + 1]!);
  });
  expect(result.current.snapshot).toBe(seen[at]);

  act(() => {
    result.current.dismiss();
  });
  expect(result.current.snapshot).toBe(seen[at + 1]);
  expect(result.current.awaitingDismissal).toBe(false);
});

test("a held lead is never stranded, however the trick is left", () => {
  const seen = dealAsSeen(0);
  const at = theirLeadPastATrick(seen);
  const { result } = renderHook(() => useTrickGate());

  act(() => {
    result.current.receive(seen[at - 1]!);
    result.current.receive(seen[at]!);
    result.current.receive(seen[at + 1]!);
  });
  expect(result.current.snapshot).toBe(seen[at]);

  // Nothing calls `dismiss` — the case where `PlayPhase` has gone before its own
  // sweep could fire. The game must not simply stop.
  act(() => {
    vi.advanceTimersByTime(trickStageTime());
  });
  expect(result.current.snapshot).toBe(seen[at + 1]);
});

test("this seat's own card is never held back", () => {
  // Both seats, because which one ever leads past a trick it did not win is a
  // fact about the deal rather than about the rule.
  for (const seat of [0, 1] as const) {
    const seen = dealAsSeen(seat);
    let mine = 0;
    for (const [index, snapshot] of seen.entries()) {
      const next = seen[index + 1];
      if (next === undefined || !lying(snapshot) || next.view.currentTrick.length !== 1) {
        continue;
      }
      if (next.view.currentTrick[0]?.by !== next.view.me) {
        continue;
      }
      mine += 1;
      expect(landsOnResolvedTrick(snapshot, next)).toBe(false);
    }
    expect(mine, `seat ${seat} never led past a trick, so this asserted nothing`).toBeGreaterThan(0);
  }
});

test("a card that completes a trick lands rather than waiting", () => {
  const seen = dealAsSeen(0);
  let completing = 0;
  for (const [index, snapshot] of seen.entries()) {
    const next = seen[index + 1];
    if (
      next === undefined ||
      snapshot.view.currentTrick.length !== 1 ||
      next.view.completedTricks.length !== snapshot.view.completedTricks.length + 1
    ) {
      continue;
    }
    completing += 1;
    expect(landsOnResolvedTrick(snapshot, next)).toBe(false);
  }
  expect(completing, "no trick was completed in this walk").toBe(13);
});

test("a whole deal reaches its end through the gate with nobody dismissing anything", () => {
  const seen = dealAsSeen(0);
  const { result } = renderHook(() => useTrickGate());
  let waited = 0;

  for (const snapshot of seen) {
    act(() => {
      result.current.receive(snapshot);
    });
    if (result.current.snapshot !== snapshot) {
      waited += 1;
    }
    // Only the failsafe ever runs here, which is the point: the deal has to
    // finish even when nothing on screen is calling `dismiss`.
    act(() => {
      vi.advanceTimersByTime(trickStageTime());
    });
    expect(result.current.snapshot).toBe(snapshot);
  }

  expect(waited, "nothing was ever held, so this walk tested nothing").toBeGreaterThan(0);
  expect(result.current.snapshot?.view.phase).toBe("complete");
});

test("the gate's handle on an arriving snapshot is stable across renders", () => {
  // `useNetworkSession` lists `receive` among the connect effect's dependencies,
  // so an identity that changed per render would tear the socket down and build it
  // again on every incoming message — a reconnect loop that nothing would report.
  const { rerender, result } = renderHook(() => useTrickGate());
  const first = result.current.receive;
  const dismissing = result.current.dismiss;
  act(() => {
    result.current.receive(dealAsSeen(0)[0]!);
  });
  rerender();
  expect(result.current.receive).toBe(first);
  expect(result.current.dismiss).toBe(dismissing);
});
