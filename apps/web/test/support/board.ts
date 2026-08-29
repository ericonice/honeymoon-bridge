import { applyTableAction, nextDeal, startTable } from "@hb/engine";
import type { DealAction, PlayerId, RubberState, TableState, Unlock } from "@hb/engine";
import { snapshotFor } from "@hb/protocol";
import { act, render } from "@testing-library/react";
import { createElement, useEffect, useRef, useState } from "react";
import { vi } from "vitest";
import { GameBoard } from "../../src/ui/GameBoard.js";
import type { GameSession } from "../../src/game/session.js";

/**
 * The board driven the way a networked seat drives it.
 *
 * `GameSession` is the whole of what `GameBoard` is given, so a session built
 * the way `networkSession.ts` builds one — nothing pacing the other seat on
 * this seat's behalf, a `dismissTrick` that does nothing — over a `TableState`
 * the test advances itself is the real thing rather than a stand-in. The seat
 * opposite is the test, which is what lets it move without waiting: over a
 * network it is under no obligation to.
 */
export interface Board {
  /** Applies an action as either seat, as the Durable Object would. */
  apply(player: PlayerId, action: DealAction): void;
  /** Deals again, as the server does once both seats have asked to. */
  next(): void;
  /** The table as it stands, after everything the board and the test have done. */
  readonly state: TableState;
  /**
   * Hands the board a set of unlocks, the way the tracker does against the
   * computer and the way a server push does at a table. Whether a real unlock
   * ever gets here is those two's business; this is for what the board does once
   * it has.
   */
  unlock(unlocked: readonly Unlock[]): void;
}

interface Controller {
  apply: (player: PlayerId, action: DealAction) => void;
  next: () => void;
  state: TableState;
  unlock: (unlocked: readonly Unlock[]) => void;
}

const controller: Controller = {
  apply: () => {},
  next: () => {},
  state: startTable({ seed: 1, starter: 0 }),
  unlock: () => {},
};

export const board: Board = {
  apply: (player, action) => {
    act(() => {
      controller.apply(player, action);
    });
  },
  next: () => {
    act(() => {
      controller.next();
    });
  },
  get state() {
    return controller.state;
  },
  unlock: (unlocked) => {
    act(() => {
      controller.unlock(unlocked);
    });
  },
};

function Harness({
  seat,
  sound,
  table,
  tapToSelect,
  trickCount,
}: {
  readonly seat: PlayerId;
  readonly sound: boolean;
  readonly table: TableState;
  readonly tapToSelect: boolean;
  readonly trickCount: boolean;
}): React.JSX.Element {
  const [state, setState] = useState(table);
  const [, setProcessed] = useState(0);
  const [unlocked, setUnlocked] = useState<readonly Unlock[]>([]);
  const snapshot = snapshotFor({ kind: "rubber", table: state }, seat);
  controller.apply = (player, action) => {
    setState((current) => applyTableAction(current, player, action));
  };
  controller.next = () => {
    setState((current) => nextDeal(current, current.deal.starter + 11));
  };
  controller.state = state;
  controller.unlock = setUnlocked;

  // The game against the computer runs effects of its own the instant a deal
  // completes — achievements and the rubber report both set state from one — so
  // the board is re-rendered from a passive effect at exactly the moment the
  // end of a deal is decided. Mirrored here because that ordering is what the
  // phase the board *shows* has to survive.
  const processedDeal = useRef<unknown>(null);
  useEffect(() => {
    if (state.deal.phase !== "complete" || processedDeal.current === state.deal) {
      return;
    }
    processedDeal.current = state.deal;
    setProcessed((count) => count + 1);
  }, [state.deal]);

  const session: GameSession = {
    act: (action: DealAction) => {
      setState((current) => applyTableAction(current, seat, action));
    },
    clearUnlocks: () => {
      setUnlocked([]);
    },
    dismissTrick: () => {},
    justTaken: snapshot.justTaken,
    justUnlocked: unlocked,
    lastDraw: snapshot.lastDraw,
    lastTrick: snapshot.lastTrick,
    nextDeal: () => {
      controller.next();
    },
    opponentHand: null,
    opponentLastDraw: null,
    opponentName: "Them",
    opponentPending: null,
    opponentWaitingToContinue: false,
    // Straight off the snapshot rather than reassembled here. The server decides
    // what a seat is told, and a client rebuilding the standing from parts would be
    // a second answer to that question.
    standing: snapshot.standing,
    matchComplete: snapshot.matchComplete,
    dealBonus: snapshot.dealBonus,
    dealsPlayed: snapshot.dealsPlayed,
    format: snapshot.format,
    score: snapshot.score,
    skipPhase: null,
    trickAwaitingDismissal: false,
    view: snapshot.view,
    vulnerable: snapshot.vulnerable,
    waitingOnOpponent: snapshot.view.toAct !== snapshot.view.me,
    halfComplete: false,
    thinking: false,
    winner: null,
    playSameBoards: null,
    repeated: false,
    waitingToContinue: false,
  };

  return createElement(GameBoard, {
    // Tests render the roomy layout; the compact one is a different set of
    // classes on the same components and has nothing of its own to assert.
    density: "normal",
    devTools: false,
    exit: null,
    onShowSettings: () => {},
    peeking: false,
    ratings: { mine: null, opponent: null },
    session,
    sound,
    tapToSelect,
    trickCount,
    walkthrough: false,
  });
}

export interface RenderBoardOptions {
  /** The rubber the deal is played into. Defaults to a fresh one. */
  readonly rubberBefore?: RubberState;
  readonly seat: PlayerId;
  readonly seed: number;
  /** Off unless a test is about sound: the stub below has no real Web Audio in it. */
  readonly sound?: boolean;
  readonly tapToSelect?: boolean;
  /** On by default, as it ships. Pass false for a test about the screen without it. */
  readonly trickCount?: boolean;
}

export function renderBoard({
  rubberBefore,
  seat,
  seed,
  sound = false,
  tapToSelect = false,
  trickCount = true,
}: RenderBoardOptions): void {
  const table = startTable({ seed, starter: 0 });
  render(
    createElement(Harness, {
      seat,
      sound,
      table: rubberBefore === undefined ? table : { ...table, rubberBefore },
      tapToSelect,
      trickCount,
    }),
  );
}

/** Lets `ms` of animation and pacing run. */
export function settle(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * The browser APIs this board reaches for that jsdom does not have: a
 * `ResizeObserver` for the hand's own width, and Web Audio, which
 * `soundEffects` unlocks off the first pointer event anywhere.
 */
export function stubBrowser(): void {
  globalThis.AudioContext = class {
    readonly state = "running";
  } as unknown as typeof AudioContext;
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}
