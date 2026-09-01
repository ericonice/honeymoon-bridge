import { describe, expect, it } from "vitest";
import { cardId, opponentOf } from "../src/cards.js";
import { applyAction, legalActions, startDeal } from "../src/deal.js";
import {
  BOARDS_PER_SESSION,
  boardsForDeals,
  dealsFor,
  drewFirstOn,
  firstPlayOf,
  firstPlayTotal,
  minGapFor,
  netTo,
  applyDuplicateAction,
  bonusFor,
  impsFor,
  marginTo,
  nextDuplicateDeal,
  replayOf,
  replayTotal,
  scheduleFor,
  scheduleKindOf,
  scoreDuplicateDeal,
  startDuplicate,
  starterFor,
  summarizeDuplicate,
  vulnerableFor,
} from "../src/duplicate.js";
import type { DuplicateSchedule, DuplicateState } from "../src/duplicate.js";
import type { Card, Contract, DealState, Level, Pair, PlayerId, Rank, Strain, Suit } from "../src/types.js";

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

/** Two cards apiece with nothing in them, so honors never muddy a scoring assertion. */
const NO_HONORS: Pair<readonly Card[]> = [
  [card(2, "C"), card(3, "D")],
  [card(4, "H"), card(5, "S")],
];

function contract(
  level: Level,
  strain: Strain,
  doubling: Contract["doubling"] = "none",
): Contract {
  return { declarer: 0, doubling, level, strain };
}

function points(
  level: Level,
  strain: Strain,
  tricks: number,
  options: { doubling?: Contract["doubling"]; vulnerable?: Pair<boolean> } = {},
): { bonus: number; points: Pair<number> } {
  const result = scoreDuplicateDeal(
    {
      contract: contract(level, strain, options.doubling ?? "none"),
      hands: NO_HONORS,
      tricksWon: [tricks, 13 - tricks],
    },
    options.vulnerable ?? [false, false],
  );
  return { bonus: result.bonus, points: result.points };
}

/**
 * Each seat's thirteen offered pairs, in order, as the deal actually presented
 * them — card 1 off `pending` and card 2 off the top of the stock.
 *
 * The whole design rests on these being a function of the seed alone, so they are
 * observed rather than assumed. `take` decides what the driver does with them,
 * which is precisely the thing that must not matter.
 */
function offersFor(seed: number, starter: PlayerId, take: "first" | "second"): Pair<string[]> {
  let state: DealState = startDeal({ seed, starter });
  const offers: Pair<string[]> = [[], []];

  while (state.phase === "draw") {
    const seat = state.toAct;
    offers[seat].push(`${cardId(state.pending!)}+${cardId(state.stock[0]!)}`);
    state = applyAction(state, seat, { type: "draw-decide", take });
  }
  return offers;
}

/** Drives a whole session with the dullest legal choice at every turn. */
function playOut(session: DuplicateState): DuplicateState {
  let current = session;
  for (let guard = 0; guard < 4000; guard++) {
    if (current.deal.phase === "complete") {
      if (summarizeDuplicate(current).complete) {
        return current;
      }
      current = nextDuplicateDeal(current);
      continue;
    }
    const seat = current.deal.toAct;
    const actions = legalActions(current.deal, seat).filter((action) => action.type !== "claim");
    current = applyDuplicateAction(current, seat, actions[0]!);
  }
  throw new Error("session did not finish");
}

describe("the foundation duplicate rests on", () => {
  /**
   * The claim the whole format depends on: a turn spends exactly two stock cards
   * and turns alternate unconditionally, so nothing either player does can change
   * what either of them is offered. Checked by driving the same seed under two
   * opposite policies rather than by reading the reducer.
   */
  it("offers each seat the same thirteen pairs whatever anybody chooses", () => {
    const keeping = offersFor(4242, 0, "first");
    const rejecting = offersFor(4242, 0, "second");

    expect(keeping[0]).toHaveLength(13);
    expect(keeping).toEqual(rejecting);
  });

  /** Flipping the starter is the seat swap, and it has to be exact rather than similar. */
  it("swaps the two streams exactly when the starter is flipped", () => {
    const asDealt = offersFor(77, 0, "first");
    const swapped = offersFor(77, 1, "first");

    expect(asDealt[0]).toEqual(swapped[1]);
    expect(asDealt[1]).toEqual(swapped[0]);
  });

  /** A replay is the same board from the other side, which is one line of arithmetic. */
  it("gives the first draw to the other seat on a replay", () => {
    const board = { seed: 9, starter: 1 as PlayerId };
    expect(starterFor(board, false)).toBe(1);
    expect(starterFor(board, true)).toBe(0);
  });
});

describe("scoring a duplicate deal", () => {
  it("pays a flat bonus for a part-score, since there is nothing to carry it toward", () => {
    // 2H making: 60 below the line, which is short of a game.
    expect(points(2, "H", 8)).toEqual({ bonus: 50, points: [110, 0] });
  });

  it("pays a game at once, and more when vulnerable", () => {
    expect(points(4, "H", 10).points[0]).toBe(420);
    expect(points(4, "H", 10, { vulnerable: [true, false] }).points[0]).toBe(620);
  });

  it("pays nothing at all for a contract that went down", () => {
    const down = points(4, "H", 9);
    expect(down.bonus).toBe(0);
    expect(down.points).toEqual([0, 50]);
  });

  /**
   * The case a table of levels would get wrong. 2S doubled and made is 120 below
   * the line — a game — even though the same contract undoubled is a part-score,
   * which is why the bonus is read off the below-line total rather than off the
   * level.
   */
  it("treats a doubled part-score that reaches 100 as the game it is", () => {
    expect(points(2, "S", 8).bonus).toBe(50);
    expect(points(2, "S", 8, { doubling: "doubled" }).bonus).toBe(300);
  });

  it("counts honors, including a defender's", () => {
    const aces: Pair<readonly Card[]> = [
      [card(2, "C")],
      [card(14, "C"), card(14, "D"), card(14, "H"), card(14, "S")],
    ];
    const scored = scoreDuplicateDeal(
      { contract: contract(3, "NT"), hands: aces, tricksWon: [9, 4] },
      [false, false],
    );
    expect(scored.points[1]).toBe(150);
  });

  it("reads the threshold off the below-line total", () => {
    expect(bonusFor(90, false)).toBe(50);
    expect(bonusFor(100, false)).toBe(300);
    expect(bonusFor(100, true)).toBe(500);
  });
});

describe("prescribed vulnerability", () => {
  const board = { seed: 1, starter: 0 as PlayerId };

  /**
   * **The property that makes a board comparable, and it was broken.**
   *
   * Vulnerability attaches to the seat that draws first *on the run being played*,
   * so the replay lands it on the other person and it cancels out of the difference
   * between the two runs. It used to be assigned from `board.starter` — a fixed
   * player — so the same person was vulnerable both times, sitting in a different
   * position each time, and boards on the vulnerable rungs never cancelled.
   *
   * The old version of this test swapped the board's *starter* to fake the mirror
   * instead of asking for the replay, which is precisely why it passed. It asks for
   * the replay now, because that is the call the game makes.
   */
  it("follows whoever draws first on this run, so the replay mirrors it", () => {
    expect(vulnerableFor(board, 1, false)).toEqual([true, false]);
    expect(vulnerableFor(board, 1, true)).toEqual([false, true]);

    // And the other way round on the rung that names the second drawer.
    expect(vulnerableFor(board, 2, false)).toEqual([false, true]);
    expect(vulnerableFor(board, 2, true)).toEqual([true, false]);
  });

  it("runs the four-board cycle: neither, first drawer, second drawer, both", () => {
    expect([0, 1, 2, 3].map((index) => vulnerableFor(board, index, false))).toEqual([
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ]);
  });

  /** The two ends of the cycle are the same either way round, which is what makes them ends. */
  it("is identical on both runs where the cycle names nobody or everybody", () => {
    for (const index of [0, 3]) {
      expect(vulnerableFor(board, index, false)).toEqual(vulnerableFor(board, index, true));
    }
  });

  it("repeats every four boards", () => {
    expect(vulnerableFor(board, 5, false)).toEqual(vulnerableFor(board, 1, false));
  });
});

describe("how a session orders its deals", () => {
  const OPTIONS = { firstBoard: 100, scheduleSeed: 7, starter: 0 as PlayerId };

  /** Whatever the order, every board is played exactly twice — once each way. */
  function checkShape(schedule: readonly { board: number; replay: boolean }[], boards: number): void {
    expect(schedule).toHaveLength(boards * 2);
    for (let board = 0; board < boards; board++) {
      const runs = schedule.filter((entry) => entry.board === board);
      expect(runs.map((entry) => entry.replay).sort(), `board ${board}`).toEqual([false, true]);
    }
    // And a replay never precedes the run it is a replay of, in any of the three.
    for (const [position, entry] of schedule.entries()) {
      if (entry.replay) {
        const first = schedule.findIndex((one) => one.board === entry.board && !one.replay);
        expect(first).toBeLessThan(position);
      }
    }
  }

  it("plays a board's two runs back to back when asked to", () => {
    const schedule = scheduleFor(4, 12, 3, "adjacent");
    checkShape(schedule, 4);
    expect(schedule.map((entry) => entry.board)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(schedule.map((entry) => entry.replay)).toEqual([
      false, true, false, true, false, true, false, true,
    ]);
  });

  /**
   * The one schedule with no randomness in it at all — every board once, then
   * the replays in that identical order, whichever seed is handed in.
   */
  it("replays every board in the same order it was first dealt, when asked to", () => {
    for (const seed of [1, 2, 3]) {
      const schedule = scheduleFor(4, seed, 3, "sequence");
      checkShape(schedule, 4);
      expect(schedule.map((entry) => entry.board)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
      expect(schedule.map((entry) => entry.replay)).toEqual([
        false, false, false, false, true, true, true, true,
      ]);
    }
  });

  /**
   * Deliberately no floor, which is the difference between this and `halves`: asking
   * for completely random and getting a constrained shuffle would be the setting not
   * doing what it says.
   */
  it("shuffles everything when asked, with a replay free to land anywhere after", () => {
    const orders = new Set<string>();
    let sawAdjacentPair = false;

    for (let seed = 1; seed <= 60; seed++) {
      const schedule = scheduleFor(4, seed, 3, "random");
      checkShape(schedule, 4);
      orders.add(schedule.map((entry) => `${entry.board}${entry.replay ? "r" : "f"}`).join(","));
      sawAdjacentPair =
        sawAdjacentPair ||
        schedule.some(
          (entry, index) =>
            index > 0 && entry.replay && schedule[index - 1]!.board === entry.board,
        );
    }

    expect(orders.size).toBeGreaterThan(1);
    // The floor is genuinely absent, rather than absent in name only.
    expect(sawAdjacentPair).toBe(true);
  });

  it("keeps the floor for halves, which is the only schedule it applies to", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const schedule = scheduleFor(BOARDS_PER_SESSION, seed, minGapFor(BOARDS_PER_SESSION), "halves");
      checkShape(schedule, BOARDS_PER_SESSION);
      for (const [position, entry] of schedule.entries()) {
        if (entry.replay) {
          expect(position - entry.board).toBeGreaterThanOrEqual(minGapFor(BOARDS_PER_SESSION));
        }
      }
    }
  });

  it("defaults to halves, so nothing changes for a caller that does not ask", () => {
    expect(scheduleFor(5, 9, 3)).toEqual(scheduleFor(5, 9, 3, "halves"));
  });

  /** Every schedule plays out, and every one still cancels between identical players. */
  it("is a dead heat between identical players under any order", () => {
    for (const schedule of ["adjacent", "halves", "random", "sequence"] as const) {
      const summary = summarizeDuplicate(
        playOut(startDuplicate({ ...OPTIONS, boards: 3, schedule })),
      );
      expect(summary.complete, schedule).toBe(true);
      expect(summary.dealsPlayed, schedule).toBe(6);
      expect(summary.margin, schedule).toEqual([0, 0]);
    }
  });
});

/**
 * `scheduleKindOf` reads a session's own schedule back, rather than trusting a
 * separately stored value — see its own doc for why. `sequence` is the one kind
 * added by fixing what would otherwise have been a real gap here: it shares
 * `halves`'s own first-half-then-second-half shape, and the two are told apart
 * only by whether the replay half repeats the first half's order exactly.
 */
describe("recovering which order a session was dealt in", () => {
  const asSession = (schedule: DuplicateState["schedule"]): DuplicateState =>
    ({ schedule }) as DuplicateState;

  it("recognises the two deterministic kinds, every time", () => {
    for (const kind of ["adjacent", "sequence"] as const) {
      const schedule = scheduleFor(5, 12, minGapFor(5), kind);
      expect(scheduleKindOf(asSession(schedule)), kind).toBe(kind);
    }
  });

  /**
   * Not every seed, because a `random` schedule can coincidentally land on
   * exactly the shape `halves` or `sequence` would have produced — see this
   * function's own doc — and that is not a failure to recognise it, it is the
   * same schedule either name would deal. Across enough seeds, some read back
   * as `halves` and some as `random`, which is what the discriminating check
   * is actually for.
   */
  it("recognises halves and random across a spread of seeds", () => {
    const seen = new Set<DuplicateSchedule>();
    for (let seed = 1; seed <= 30; seed++) {
      seen.add(scheduleKindOf(asSession(scheduleFor(5, seed, minGapFor(5), "halves"))));
      seen.add(scheduleKindOf(asSession(scheduleFor(5, seed, minGapFor(5), "random"))));
    }
    expect(seen.has("halves")).toBe(true);
    expect(seen.has("random")).toBe(true);
  });

  /**
   * `halves`'s own rejection sampling falls back to the identity permutation when
   * nothing shuffled satisfies its floor — see `scheduleFor`. That fallback deals
   * exactly like `sequence` would, so reading it as `sequence` is not a
   * misdiagnosis: it is the same schedule either name would produce.
   */
  it("reads halves's own identity-permutation fallback as sequence", () => {
    // A floor above the board count leaves no shuffle able to satisfy it, so
    // every attempt is rejected and the guaranteed-valid fallback is what ships.
    const schedule = scheduleFor(4, 1, 10, "halves");
    expect(schedule.slice(4).map((entry) => entry.board)).toEqual([0, 1, 2, 3]);
    expect(scheduleKindOf(asSession(schedule))).toBe("sequence");
  });

  /**
   * `summarizeDuplicate` is the one caller a screen actually goes through, so
   * this is the check that it did not forget to ask — a summary whose own
   * `schedule` field disagreed with `scheduleKindOf` would be a second,
   * un-synchronised statement of the same fact, which is exactly what
   * recovering it from the schedule was meant to avoid.
   */
  it("carries the recovered kind on the summary a screen actually reads", () => {
    for (const kind of ["adjacent", "halves", "random", "sequence"] as const) {
      const session = startDuplicate({
        boards: 3,
        firstBoard: 100,
        schedule: kind,
        scheduleSeed: 7,
        starter: 0,
      });
      expect(summarizeDuplicate(session).schedule, kind).toBe(scheduleKindOf(session));
    }
  });
});

describe("a session's length", () => {
  const OPTIONS = { firstBoard: 100, scheduleSeed: 7, starter: 0 as PlayerId };

  it("is twice its boards, because every board is played twice", () => {
    expect(dealsFor(5)).toBe(10);
    expect(boardsForDeals(10)).toBe(5);
  });

  /**
   * The rule an odd count breaks. Seven deals is not a short session — it is a
   * session with one board played once, and a board played once is a score with
   * nothing to compare against. Rounded rather than refused, since an odd count can
   * only reach this from a stored preference and a preference is not an action.
   */
  it("rounds an odd count rather than leaving a board played once", () => {
    expect(dealsFor(boardsForDeals(7)) % 2).toBe(0);
    expect(boardsForDeals(0)).toBe(1);
    expect(boardsForDeals(-4)).toBe(1);
  });

  it("plays every length out to twice its boards", () => {
    for (const boards of [1, 3, 8]) {
      const summary = summarizeDuplicate(playOut(startDuplicate({ ...OPTIONS, boards })));
      expect(summary.complete, `${boards} boards`).toBe(true);
      expect(summary.dealsPlayed).toBe(dealsFor(boards));
      expect(summary.closed).toBe(boards);
    }
  });

  /** And the control run holds at every length, not only at the default. */
  it("is a dead heat between identical players at any length", () => {
    for (const boards of [1, 3, 8]) {
      const summary = summarizeDuplicate(playOut(startDuplicate({ ...OPTIONS, boards })));
      expect(summary.margin, `${boards} boards`).toEqual([0, 0]);
    }
  });
});

describe("the schedule", () => {
  it("plays every board once and then replays every board once", () => {
    const schedule = scheduleFor(5, 12, 3);
    expect(schedule).toHaveLength(10);
    for (let board = 0; board < 5; board++) {
      const runs = schedule.filter((entry) => entry.board === board);
      expect(runs.map((entry) => entry.replay).sort()).toEqual([false, true]);
    }
  });

  it("plays the first half in board order", () => {
    expect(scheduleFor(5, 12, 3).slice(0, 5)).toEqual([
      { board: 0, replay: false },
      { board: 1, replay: false },
      { board: 2, replay: false },
      { board: 3, replay: false },
      { board: 4, replay: false },
    ]);
  });

  /**
   * The floor is what stops a board being replayed while its first run is still
   * fresh, which is the one thing a free permutation does worse than a fixed
   * order. Checked over many seeds and every board count anybody can choose,
   * since it is a property of every schedule rather than of a lucky one.
   */
  it("never replays a board sooner than the floor allows, at any length", () => {
    for (const boards of [1, 2, 3, 4, 5, 8, 12]) {
      const floor = minGapFor(boards);
      for (let seed = 1; seed <= 60; seed++) {
        const schedule = scheduleFor(boards, seed, floor);
        expect(schedule).toHaveLength(boards * 2);
        for (const [position, entry] of schedule.entries()) {
          if (entry.replay) {
            expect(position - entry.board, `${boards} boards, seed ${seed}`).toBeGreaterThanOrEqual(
              floor,
            );
          }
        }
      }
    }
  });

  /**
   * The floor scales with what it is a floor on, which is what the board count
   * being configurable forced. A flat three admits only the identity permutation
   * at three boards — no schedule at all — and lets a board back after three
   * deals at twelve, where the average gap is twelve.
   */
  it("scales the floor with the length rather than fixing it", () => {
    expect(minGapFor(3)).toBe(2);
    expect(minGapFor(5)).toBe(3);
    expect(minGapFor(10)).toBe(6);
    // Never above the count, or no schedule could satisfy it.
    for (const boards of [1, 2, 3, 5, 8, 12]) {
      expect(minGapFor(boards)).toBeLessThanOrEqual(boards);
      expect(minGapFor(boards)).toBeGreaterThanOrEqual(1);
    }
  });

  /**
   * A schedule that always came back in board order would satisfy every
   * assertion above and defeat the entire point of randomising, which is that the
   * board's identity cannot be worked out from the count.
   */
  it("does not simply replay them in the same order, which would be no schedule at all", () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const replays = scheduleFor(BOARDS_PER_SESSION, seed, minGapFor(BOARDS_PER_SESSION))
        .filter((entry) => entry.replay)
        .map((entry) => entry.board);
      orders.add(replays.join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("is reproducible from its seed, since a session has to be re-scorable", () => {
    expect(scheduleFor(5, 99, 3)).toEqual(scheduleFor(5, 99, 3));
  });
});

describe("a session", () => {
  const options = { firstBoard: 100, scheduleSeed: 7, starter: 0 as PlayerId };

  it("numbers its boards from the first, since a board number is its seed", () => {
    const session = startDuplicate(options);
    expect(session.boards.map((board) => board.seed)).toEqual([100, 101, 102, 103, 104]);
    expect(session.deal).toBeDefined();
  });

  it("alternates who draws first across the boards", () => {
    expect(startDuplicate(options).boards.map((board) => board.starter)).toEqual([0, 1, 0, 1, 0]);
  });

  it("deals each board from its own seed, both times", () => {
    const session = playOut(startDuplicate({ ...options, boards: 2, minGap: 2 }));
    const summary = summarizeDuplicate(session);

    expect(summary.dealsPlayed).toBe(4);
    for (const outcome of summary.boards) {
      expect(outcome.played).toHaveLength(2);
    }
  });

  it("plays out to a complete session with a zero-sum margin", () => {
    const summary = summarizeDuplicate(playOut(startDuplicate(options)));

    expect(summary.complete).toBe(true);
    expect(summary.closed).toBe(BOARDS_PER_SESSION);
    expect(summary.margin[0]).toBe(0 - summary.margin[1]!);
  });

  /**
   * **The control run, and the reason the format is worth building.** Both seats
   * are driven by one policy, so the replay of a board is its first run with the
   * two seats relabelled — the streams are swapped and the players are identical.
   * Every board must therefore be flat and the session a dead heat, however large
   * the individual scores were.
   *
   * This is the duplicate counterpart of `bench/rubber.ts`'s own control, where
   * one bidder against an exact copy of itself must score 50% — and that control is
   * what caught the oracle doubler handicapping whichever seat it was applied to.
   * A format claiming to cancel the deal has to cancel it exactly when there is
   * nothing else left to separate the players.
   */
  it("is a dead heat between two identical players, which is the format cancelling the deal", () => {
    const summary = summarizeDuplicate(playOut(startDuplicate(options)));
    // The plain driver passes most deals out, so on its own this control is silent
    // about anything a passed-out deal does not exercise — vulnerability included,
    // which is how a real fault survived it. `moves while boards are open` is the
    // one that bids; this one is here for the schedule and the pairing.

    expect(summary.closed).toBe(BOARDS_PER_SESSION);
    for (const outcome of summary.boards) {
      expect(outcome.margin, `board ${outcome.board}`).toBe(0);
    }
    expect(summary.margin).toEqual([0, 0]);
    expect(summary.winner).toBeNull();
  });

  it("totals the session as the sum of its boards and nothing else", () => {
    const summary = summarizeDuplicate(playOut(startDuplicate({ ...options, scheduleSeed: 31 })));
    const summed = summary.boards.reduce((total, outcome) => total + marginTo(outcome, 0), 0);

    expect(summary.margin[0]).toBe(summed);
  });

  /**
   * **The score moves on every deal rather than waiting for a board to come round.**
   *
   * It used to total closed boards only, which on a short session left it at nil for
   * most of the way — a running score that does not run. The two readings agree once
   * every board is shut, because a board's margin is the sum of its two runs read
   * from one seat; what changed is only what happens in between.
   *
   * Driven by a policy that actually *bids*, because the dull one passes most deals
   * out and a session of passed-out deals scores nothing either way — which would
   * make this pass without testing anything. What it asserts is the pair of facts
   * that matter together: the figure is non-nil while boards are open, and back to
   * exactly nil once they have all come round, since one policy from both seats
   * makes every board flat.
   */
  it("moves while boards are open and still cancels once they close", () => {
    let session = startDuplicate({ ...options, boards: 3 });
    let sawRunningScore = false;

    for (let deal = 0; deal < 6; deal++) {
      while (session.deal.phase !== "complete") {
        const seat = session.deal.toAct;
        const legal = legalActions(session.deal, seat).filter((one) => one.type !== "claim");
        const bid = legal.find((one) => one.type === "call" && one.call.type === "bid");
        session = applyDuplicateAction(session, seat, bid ?? legal[0]!);
      }
      const after = summarizeDuplicate(session);

      // The running figure is the sum of the deal rows, open boards included.
      const summed = after.boards.reduce(
        (total, board) => total + board.played.reduce((sum, run) => sum + netTo(board, run, 0), 0),
        0,
      );
      expect(after.margin[0], `after deal ${deal + 1}`).toBe(summed);
      sawRunningScore = sawRunningScore || after.margin[0] !== 0;

      if (!after.complete) {
        session = nextDuplicateDeal(session);
      }
    }

    const done = summarizeDuplicate(session);
    expect(done.complete).toBe(true);
    // It really ran, rather than sitting at nil and arriving at nil.
    expect(sawRunningScore).toBe(true);
    // And it still cancels: identical players, so every board is flat.
    expect(done.margin).toEqual([0, 0]);
  });

  it("names no winner until every board is in", () => {
    let session = startDuplicate(options);
    while (!summarizeDuplicate(session).complete) {
      const before = summarizeDuplicate(session);
      expect(before.winner).toBeNull();
      session = playOut2(session);
    }
    const summary = summarizeDuplicate(session);
    expect(summary.complete).toBe(true);
  });

  /** One deal at a time, so the assertion above can look between them. */
  function playOut2(session: DuplicateState): DuplicateState {
    let current = session;
    while (current.deal.phase !== "complete") {
      const seat = current.deal.toAct;
      const actions = legalActions(current.deal, seat).filter((action) => action.type !== "claim");
      current = applyDuplicateAction(current, seat, actions[0]!);
    }
    return summarizeDuplicate(current).complete ? current : nextDuplicateDeal(current);
  }

  /**
   * A rubber has to redeal a passed-out board, since nothing was scored and the
   * standing has not moved. A session must not: the board is a result, and the
   * other run's score becomes the whole margin. Redealing would substitute a
   * different stock and leave nothing to compare.
   */
  it("does not redeal a board that was passed out", () => {
    let session = startDuplicate({ ...options, boards: 2, minGap: 2 });
    const first = session.deal.starter;
    while (session.deal.phase === "draw") {
      session = applyDuplicateAction(session, session.deal.toAct, {
        type: "draw-decide",
        take: "first",
      });
    }
    session = applyDuplicateAction(session, first, { type: "call", call: { type: "pass" } });
    session = applyDuplicateAction(session, opponentOf(first), {
      type: "call",
      call: { type: "pass" },
    });
    expect(session.deal.passedOut).toBe(true);

    const next = nextDuplicateDeal(session);
    expect(next.at).toBe(1);
    expect(next.results).toHaveLength(1);
    expect(next.results[0]!.points).toBe(0);
    expect(next.results[0]!.contract).toBeNull();
  });

  /**
   * **The arithmetic a scorepad shows rather than asserts.** Read from a fixed seat,
   * a board's margin is the *sum* of its two runs — not a difference to be taken on
   * trust. It falls out of the definition: the board is signed toward whoever drew
   * first the first time, and the replay hands that seat to the other player, so
   * subtracting their run is adding your own.
   *
   * Asserted here rather than in the component, because it is a fact about the
   * scoring and a screen that showed two numbers not adding up to the third would
   * be reporting this bug rather than causing it.
   */
  it("makes a board's margin the sum of its two runs, from either seat", () => {
    const summary = summarizeDuplicate(playOut(startDuplicate({ ...options, boards: 3, minGap: 2 })));

    for (const board of summary.boards) {
      expect(board.played).toHaveLength(2);
      for (const seat of [0, 1] as PlayerId[]) {
        const summed = board.played.reduce((total, run) => total + netTo(board, run, seat), 0);
        expect(summed, `board ${board.board}, seat ${seat}`).toBe(marginTo(board, seat));
      }
    }
  });

  /**
   * **`points` is not `margin` in disguise, even though the two agree on the
   * one thing they share.** Subtracting one seat's real score from the
   * other's always gives back the same margin `netTo` already computes —
   * that has to hold, since a run's signed net *is* `score.points[0] -
   * score.points[1]` by construction (see `resultFor`) — but the two real
   * scores are not each other's negative in general: honors and undertrick
   * penalties can pay both seats on the same deal, so `points` carries
   * information `margin` has already thrown away. Both real scores are
   * non-negative too, the same guarantee a rubber's own points have, which is
   * what let the server reporting drop its winner-takes-the-margin clamp.
   */
  it("sums a real, non-negative score for each seat, which nets to the same margin", () => {
    const summary = summarizeDuplicate(playOut(startDuplicate({ ...options, boards: 3, minGap: 2 })));

    expect(summary.points[0] - summary.points[1]).toBe(summary.margin[0]);
    expect(summary.points[0]).toBeGreaterThanOrEqual(0);
    expect(summary.points[1]).toBeGreaterThanOrEqual(0);
  });

  /**
   * The pad and the strip both build on this: first play and replay are a second
   * way to split the same margin, organised by *when* a run happened rather than
   * by which side of the stock it was, so the two must still add up to the whole.
   */
  it("splits the margin into first-play and replay subtotals that sum to it", () => {
    const summary = summarizeDuplicate(playOut(startDuplicate({ ...options, boards: 3, minGap: 2 })));

    for (const seat of [0, 1] as PlayerId[]) {
      const first = firstPlayTotal(summary, seat) ?? 0;
      const replay = replayTotal(summary, seat) ?? 0;
      expect(first + replay).toBe(summary.margin[seat]);
    }
  });

  it("reads first play and replay as null before either has happened", () => {
    const summary = summarizeDuplicate(startDuplicate({ ...options, boards: 2, minGap: 2 }));

    expect(firstPlayOf(summary.boards[0]!)).toBeNull();
    expect(replayOf(summary.boards[0]!)).toBeNull();
    expect(firstPlayTotal(summary, 0)).toBeNull();
    expect(replayTotal(summary, 0)).toBeNull();
  });

  it("names the other seat as the replay's first drawer", () => {
    const summary = summarizeDuplicate(playOut(startDuplicate({ ...options, boards: 2, minGap: 2 })));

    for (const board of summary.boards) {
      const first = board.played.find((run) => !run.replay)!;
      const replay = board.played.find((run) => run.replay)!;
      expect(drewFirstOn(board, first)).toBe(board.starter);
      expect(drewFirstOn(board, replay)).toBe(opponentOf(board.starter));
    }
  });

  it("signs a board's margin toward the seat that drew first the first time", () => {
    const outcome = { board: 0, margin: 300, played: [], starter: 1 as PlayerId };
    expect(marginTo(outcome, 1)).toBe(300);
    expect(marginTo(outcome, 0)).toBe(-300);
  });

  it("counts an unclosed board as nothing rather than as a lead", () => {
    expect(marginTo({ board: 0, margin: null, played: [], starter: 0 }, 0)).toBe(0);
  });

  /**
   * Dealing past the end of a session must not do anything.
   *
   * Found by reasoning about the button rather than by playing: the deal-complete
   * screen offers "New session" once a match is over, and it is wired to the same
   * `nextDeal` that advances the schedule. Called on a finished session that
   * appended its last result *again* — so `results` grew past `schedule.length`,
   * the last board acquired a third run, and `complete` stayed true while the
   * margin quietly changed.
   */
  it("does nothing when dealt past the end of the schedule", () => {
    const finished = playOut(startDuplicate({ ...options, boards: 2, minGap: 2 }));
    const before = summarizeDuplicate(finished);

    const again = nextDuplicateDeal(finished);
    const after = summarizeDuplicate(again);

    expect(again.results).toHaveLength(before.dealsPlayed);
    expect(after.margin).toEqual(before.margin);
    expect(after.dealsPlayed).toBe(before.dealsPlayed);
  });
});


describe("the IMP table, which is written and not used", () => {
  it("scores nothing for a difference inside a trick or two", () => {
    expect(impsFor(0)).toBe(0);
    expect(impsFor(10)).toBe(0);
  });

  it("steps at the standard boundaries", () => {
    expect(impsFor(20)).toBe(1);
    expect(impsFor(40)).toBe(1);
    expect(impsFor(50)).toBe(2);
    expect(impsFor(190)).toBe(5);
    expect(impsFor(250)).toBe(6);
    expect(impsFor(420)).toBe(9);
    expect(impsFor(910)).toBe(14);
  });

  /** The whole reason it was proposed: the scale compresses, hard. */
  it("compresses, so a disaster costs a great deal less than it scores", () => {
    expect(impsFor(400)).toBe(9);
    expect(impsFor(800)).toBe(13);
    expect(impsFor(4000)).toBe(24);
    expect(impsFor(100_000)).toBe(24);
  });

  it("carries the sign of the difference", () => {
    expect(impsFor(-250)).toBe(-6);
  });
});
