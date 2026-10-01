import { actOn, dealOf, nextIn, startMatch, startTable } from "@hb/engine";
import type {
  DealAction,
  DealRecord,
  DealState,
  FieldBoard,
  MatchFormat,
  MatchState,
  PlayerId,
  RubberState,
  Unlock,
} from "@hb/engine";
import { snapshotFor } from "@hb/protocol";
import { act, render } from "@testing-library/react";
import { createElement, useEffect, useRef, useState } from "react";
import { vi } from "vitest";
import { GameBoard } from "../../src/ui/GameBoard.js";
import type { GameSession } from "../../src/game/session.js";

/**
 * The board driven the way a networked seat drives it.
 *
 * `GameSession` is the whole of what `GameBoard` is given, so a session over a
 * `MatchState` the test advances itself is the real thing rather than a stand-in.
 * The seat opposite is the test, which is what lets it move without waiting: over
 * a network it is under no obligation to.
 *
 * **What it deliberately leaves out is `useTrickGate`, and a pass here is
 * therefore not a statement about pacing.** That gate sits *above* `GameSession`
 * — it decides which snapshot a session is built from at all — so wiring it in
 * here would test something these files are not about, and would make every
 * "the opponent never waits" walk below wait. `dismissTrick` does nothing and
 * `trickAwaitingDismissal` is false, which is the unpaced worst case and exactly
 * the right thing for a test asking whether a card is reachable. The gate has
 * `test/trickGate.test.ts` of its own.
 */
export interface Board {
  /** Applies an action as either seat, as the Durable Object would. */
  apply(player: PlayerId, action: DealAction): void;
  /** The deal on the table, which is what most of a walk is about. */
  readonly deal: DealState;
  /**
   * The match as it stands, after everything the board and the test have done.
   *
   * A `MatchState` rather than a `TableState`, which is what lets this drive a Doop
   * session as well as a rubber: the two are different machines under one union, and
   * a harness that knew only the rubber could not reach a format whose whole screen
   * is the thing under test. Hand it straight to `snapshotFor`.
   */
  readonly match: MatchState;
  /** Deals again, as the server does once both seats have asked to. */
  next(): void;
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
  match: MatchState;
  next: () => void;
  unlock: (unlocked: readonly Unlock[]) => void;
}

const controller: Controller = {
  apply: () => {},
  match: { kind: "rubber", table: startTable({ seed: 1, starter: 0 }) },
  next: () => {},
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
  get deal() {
    return dealOf(controller.match);
  },
  get match() {
    return controller.match;
  },
  unlock: (unlocked) => {
    act(() => {
      controller.unlock(unlocked);
    });
  },
};

function Harness({
  match,
  matchDetail,
  seat,
  sound,
  tapToSelect,
  trickCount,
}: {
  readonly match: MatchState;
  readonly matchDetail: boolean;
  readonly seat: PlayerId;
  readonly sound: boolean;
  readonly tapToSelect: boolean;
  readonly trickCount: boolean;
}): React.JSX.Element {
  const [state, setState] = useState(match);
  const [, setProcessed] = useState(0);
  const [unlocked, setUnlocked] = useState<readonly Unlock[]>([]);
  const snapshot = snapshotFor(state, seat);
  controller.apply = (player, action) => {
    setState((current) => actOn(current, player, action));
  };
  controller.next = () => {
    // A seed only a rubber uses — a session deals the next board off its own
    // schedule, and a field board carries its own stock.
    setState((current) => nextIn(current, dealOf(current).starter + 11));
  };
  controller.match = state;
  controller.unlock = setUnlocked;

  // The game against the computer runs effects of its own the instant a deal
  // completes — achievements and the rubber report both set state from one — so
  // the board is re-rendered from a passive effect at exactly the moment the
  // end of a deal is decided. Mirrored here because that ordering is what the
  // phase the board *shows* has to survive.
  const deal = dealOf(state);
  const processedDeal = useRef<unknown>(null);
  useEffect(() => {
    if (deal.phase !== "complete" || processedDeal.current === deal) {
      return;
    }
    processedDeal.current = deal;
    setProcessed((count) => count + 1);
  }, [deal]);

  const session: GameSession = {
    act: (action: DealAction) => {
      setState((current) => actOn(current, seat, action));
    },
    clearUnlocks: () => {
      setUnlocked([]);
    },
    // See this file's own doc comment: unpaced on purpose, not by omission.
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
    // Off the snapshot rather than hardcoded, for the same reason the standing is:
    // the server decides these and a harness answering them itself would be testing
    // its own opinion. They were false and null here while only a rubber could be
    // driven, which a mirror and a session both need to be right about.
    halfComplete: snapshot.halfComplete,
    thinking: false,
    winner: snapshot.winner,
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
    matchDetail,
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
  /**
   * The boards a Doop session plays, which is the whole of what one is.
   *
   * Required by `format: "field"` and ignored by every other, exactly as
   * `startMatch` takes them: a field board carries its own stock and its own side of
   * it, because both have to match what the recorded results were played at.
   */
  readonly fieldBoards?: readonly FieldBoard[];
  /** Defaults to a rubber, which is what most walks here are about. */
  readonly format?: MatchFormat;
  /** On by default, as it ships. Pass false for a test about the reveal without it. */
  readonly matchDetail?: boolean;
  /** Earlier deals already on the scorepad. A rubber's; ignored by every other format. */
  readonly played?: readonly DealRecord[];
  /** The rubber the deal is played into. A rubber's; ignored by every other format. */
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
  fieldBoards,
  format = "rubber",
  matchDetail = true,
  played,
  rubberBefore,
  seat,
  seed,
  sound = false,
  tapToSelect = false,
  trickCount = true,
}: RenderBoardOptions): void {
  render(
    createElement(Harness, {
      match: matchFor({ fieldBoards, format, played, rubberBefore, seed }),
      matchDetail,
      seat,
      sound,
      tapToSelect,
      trickCount,
    }),
  );
}

/**
 * The match a walk starts from.
 *
 * A rubber is built by hand rather than through `startMatch`, because the two things
 * a rubber walk wants to set — deals already on the scorepad and the rubber they
 * were scored into — are `TableState`'s and there is nowhere in `StartMatchOptions`
 * to put them. Every other format goes through `startMatch`, which is what the
 * server calls.
 */
function matchFor({
  fieldBoards,
  format,
  played,
  rubberBefore,
  seed,
}: {
  readonly fieldBoards: readonly FieldBoard[] | undefined;
  readonly format: MatchFormat;
  readonly played: readonly DealRecord[] | undefined;
  readonly rubberBefore: RubberState | undefined;
  readonly seed: number;
}): MatchState {
  if (format === "rubber" || format === "game") {
    const table = startTable({ format, seed, starter: 0 });
    return {
      kind: "rubber",
      table: {
        ...table,
        ...(rubberBefore === undefined ? {} : { rubberBefore }),
        ...(played === undefined ? {} : { played }),
      },
    };
  }
  return startMatch({
    ...(fieldBoards === undefined ? {} : { fieldBoards }),
    firstBoard: 1,
    format,
    seed,
    starter: 0,
  });
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
