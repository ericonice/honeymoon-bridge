import { opponentOf } from "./cards.js";
import {
  applyDuplicateAction,
  nextDuplicateDeal,
  startDuplicate,
  summarizeDuplicate,
} from "./duplicate.js";
import type {
  DuplicateSchedule,
  DuplicateState,
  DuplicateSummary,
  MatchFormat,
} from "./duplicate.js";
import { newRubber, totalScore, vulnerability } from "./rubber.js";
import type { RubberFormat, RubberState } from "./rubber.js";
import type { DealScore } from "./scoring.js";
import { applyTableAction, nextDeal, startTable, summarize } from "./table.js";
import type { DealRecord, TableState } from "./table.js";
import type { DealAction, DealState, Pair, PlayerId } from "./types.js";

/**
 * The score as a bidder is paid on it.
 *
 * A deal is not scored in isolation: what a contract is worth depends on where the
 * part-score stands, who is vulnerable, and whether this deal finishes a game. A
 * bidder that only asks "can I make this" is answering a question nobody is paid
 * on.
 *
 * It lives here rather than with the bot because it is a *fact about the sitting* —
 * exactly what this module exists to describe — and because two hosts now need to
 * be able to produce one. `bot/types.ts` re-exports it under its own name.
 */
export interface Standing {
  /**
   * The rubber as it stood when this deal *began*, which is what the deal is bid
   * and scored against — see `rubberBefore` in `table.ts`.
   */
  readonly rubber: RubberState;
  /** Vulnerability for this deal, which follows from the rubber before it. */
  readonly vulnerable: Pair<boolean>;
}

/**
 * A match, whichever kind is being played.
 *
 * The two are genuinely different machines rather than one with a flag. A rubber
 * accumulates toward games and carries a part-score forward, so its state is the
 * deal plus the rubber behind it; a duplicate session is a fixed list of boards
 * each scored on its own, so its state is the deal plus which board this is. A
 * union rather than a common base, because there is no common base — what they
 * share is a deal in progress and a way to be summarised.
 *
 * This exists so `useLocalSession` holds one thing instead of branching in nine
 * places. The tag is what the screens read, not the shape underneath.
 */
export type MatchState =
  | { readonly kind: "duplicate"; readonly session: DuplicateState }
  | { readonly kind: "rubber"; readonly table: TableState };

/** The standing, in whichever shape it is being kept. What the score strip and the pad read. */
export type MatchStanding =
  | { readonly kind: "duplicate"; readonly summary: DuplicateSummary }
  | {
      readonly history: readonly DealRecord[];
      readonly kind: "rubber";
      readonly rubber: RubberState;
    };

/**
 * Everything about a match that is worked out rather than stored.
 *
 * The point of it is that almost nothing here needs a branch at the call site:
 * whether the match is over, how many deals it has run, who is vulnerable and
 * what each side has are the same questions in both formats. `standing` is the
 * one field that keeps its shape, for the two displays that genuinely differ.
 */
export interface MatchSummary {
  /**
   * The bonus the finished deal earned beyond its trick score, in a format that
   * pays one per deal. Always zero in a rubber, where a game is banked rather
   * than paid.
   */
  readonly bonus: number;
  readonly complete: boolean;
  /** Deals finished, the one just completed included. */
  readonly dealsPlayed: number;
  readonly format: MatchFormat;
  /** Each side's match total, in whatever the format settles in. */
  readonly points: Pair<number>;
  /** The current deal's score, once it is complete and was not passed out. */
  readonly score: DealScore | null;
  readonly standing: MatchStanding;
  /**
   * What to hand the bidder.
   *
   * A duplicate session has no rubber, so it supplies an untouched one. That is
   * safe rather than convenient: `objectiveFor` gives a session the `"duplicate"`
   * objective, which reads `vulnerable` and nothing else, and
   * `test/duplicateObjective.test.ts` asserts exactly that — the same call is
   * worth the same at a fresh rubber and at a game in hand. If that test ever
   * fails, this is what it is telling you about.
   */
  readonly botStanding: Standing;
  /** Vulnerability as it stood for the deal in progress or just finished. */
  readonly vulnerable: Pair<boolean>;
  readonly winner: PlayerId | null;
}

export interface StartMatchOptions {
  /** Boards in a duplicate session. Ignored by a rubber. See `boardsForDeals`. */
  readonly boards?: number;
  /** How a duplicate session orders its deals. Ignored by a rubber. */
  readonly schedule?: DuplicateSchedule;
  /** Where a duplicate session's board numbers start. Ignored by a rubber. */
  readonly firstBoard: number;
  readonly format: MatchFormat;
  /** The rubber's first deal, or the session's schedule. Both are the caller's to own. */
  readonly seed: number;
  readonly starter: PlayerId;
}

export function startMatch(options: StartMatchOptions): MatchState {
  const { boards, firstBoard, format, schedule, seed, starter } = options;
  if (format === "duplicate") {
    return {
      kind: "duplicate",
      // The seed picks the replay order and nothing else — the boards are their
      // own numbers, which is what makes a session quotable and re-scorable.
      session: startDuplicate({
        ...(boards === undefined ? {} : { boards }),
        ...(schedule === undefined ? {} : { schedule }),
        firstBoard,
        scheduleSeed: seed,
        starter,
      }),
    };
  }
  return { kind: "rubber", table: startTable({ format, seed, starter }) };
}

export function dealOf(match: MatchState): DealState {
  return match.kind === "duplicate" ? match.session.deal : match.table.deal;
}

export function actOn(match: MatchState, player: PlayerId, action: DealAction): MatchState {
  if (match.kind === "duplicate") {
    return { kind: "duplicate", session: applyDuplicateAction(match.session, player, action) };
  }
  return { kind: "rubber", table: applyTableAction(match.table, player, action) };
}

/**
 * Deals the next deal, or starts a fresh match once the last one is decided.
 *
 * `nextDeal` already does both for a rubber — a won rubber is followed by a new
 * one — and a session has to do the same, because the deal-complete screen offers
 * "New session" and is wired to this. **A session cannot start its own successor**,
 * though: it needs board numbers and a schedule seed, and the engine owns no
 * randomness. So that decision lands here, where the seed already arrives.
 *
 * Mid-session the seed is *ignored*, which is the asymmetry worth knowing: a
 * rubber's deals are unbounded and have to come from somewhere, while a session's
 * were all chosen when it started. That is the point of a board being a number.
 */
export function nextIn(match: MatchState, seed: number): MatchState {
  if (match.kind === "duplicate") {
    if (summarizeDuplicate(match.session).complete) {
      return startMatch({
        // The same length *and order* as the session just finished, for the same
        // reason a new rubber is the same kind of rubber: how a sitting is played is
        // chosen when players sit down, not re-read from a setting that could have
        // moved under way. The order is recovered from the schedule rather than
        // stored twice — see `scheduleKindOf`.
        boards: match.session.boards.length,
        schedule: scheduleKindOf(match.session),
        firstBoard: seed % 1_000_000,
        format: "duplicate",
        seed,
        // The seat that drew first on the finished session's last board draws
        // second on the new one's first, so the alternation carries across the
        // boundary rather than restarting.
        starter: opponentOf(match.session.deal.starter),
      });
    }
    return { kind: "duplicate", session: nextDuplicateDeal(match.session) };
  }
  return { kind: "rubber", table: nextDeal(match.table, seed) };
}

export function summarizeMatch(match: MatchState): MatchSummary {
  if (match.kind === "duplicate") {
    const summary = summarizeDuplicate(match.session);
    return {
      bonus: summary.score?.bonus ?? 0,
      complete: summary.complete,
      dealsPlayed: summary.dealsPlayed,
      format: "duplicate",
      points: summary.margin,
      score: summary.score?.deal ?? null,
      standing: { kind: "duplicate", summary },
      botStanding: { rubber: newRubber("rubber"), vulnerable: summary.vulnerable },
      vulnerable: summary.vulnerable,
      winner: summary.winner,
    };
  }

  const summary = summarize(match.table);
  return {
    bonus: 0,
    complete: summary.rubber.complete,
    dealsPlayed: summary.history.length,
    format: summary.rubber.format,
    points: totalScore(summary.rubber),
    score: summary.score,
    standing: { history: summary.history, kind: "rubber", rubber: summary.rubber },
    // The rubber the deal was *bid* at, not the rubber including it — see
    // `rubberBefore`. Pricing a call against a standing that already contains the
    // deal being priced would be reading the answer off the back of the book.
    botStanding: {
      rubber: match.table.rubberBefore,
      vulnerable: vulnerability(match.table.rubberBefore),
    },
    vulnerable: summary.vulnerable,
    winner: summary.rubber.winner,
  };
}

/** The narrow format, for the places that genuinely only understand a rubber. */
export function rubberFormatOf(standing: MatchStanding): RubberFormat | null {
  return standing.kind === "rubber" ? standing.rubber.format : null;
}

/**
 * Which order a session was dealt in, read back off its own schedule.
 *
 * Recovered rather than stored, so there is one statement of what a session is
 * playing and no second field to disagree with it. Adjacent is the shape that can be
 * recognised — every replay directly follows its own first run — and the other two
 * are told apart by whether the first half is all first runs. A `random` schedule
 * that happens to look like `halves` is one that would deal identically anyway, so
 * reading it as halves costs nothing.
 */
export function scheduleKindOf(session: DuplicateState): DuplicateSchedule {
  const { schedule } = session;
  const adjacent = schedule.every(
    (entry, index) => !entry.replay || schedule[index - 1]?.board === entry.board,
  );
  if (adjacent) {
    return "adjacent";
  }
  const half = schedule.length / 2;
  return schedule.slice(0, half).every((entry) => !entry.replay) ? "halves" : "random";
}
