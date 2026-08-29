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
import { mirrorOf } from "./returnMatch.js";
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
  | RubberMatch;

/** Named so `canReturn` can narrow to it, which a plain boolean cannot do. */
export interface RubberMatch {
  readonly kind: "rubber";
  readonly table: TableState;
}

/** The standing, in whichever shape it is being kept. What the score strip and the pad read. */
export type MatchStanding =
  | { readonly kind: "duplicate"; readonly summary: DuplicateSummary }
  | {
      readonly history: readonly DealRecord[];
      readonly kind: "rubber";
      /**
       * What the same boards came to in the match this one is replaying, oldest
       * first. Empty unless this is a return match.
       *
       * Carries scores and nothing else — no seed, which is what a board is dealt
       * from and the one thing that must never reach a client.
       */
      readonly previous: readonly DealRecord[];
      /** What the match being replayed came to, per seat. Null unless this is one. */
      readonly previousPoints: Pair<number> | null;
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
  /**
   * This match is being played on the boards of an earlier one, from the other side.
   *
   * Two things read it. The deal-complete screen, which must not offer a return
   * match on a return match — a third run of the same cards is not a game. And the
   * recorded result, which has to stay out of the rating walk for the reason
   * duplicate does: the computer's recall of a board it has played is perfect and a
   * person's is not, so a rated match on repeated boards over-credits whichever side
   * remembers better, and that is never the person.
   */
  readonly repeated: boolean;
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

/**
 * Whether the match just finished can be played back on the same boards.
 *
 * A rubber that has been won and was dealt fresh. Not a session — duplicate
 * already plays every board twice, so there is nothing left to return — and not a
 * return match, which would be a third run of the same cards.
 */
export function canReturn(match: MatchState): match is RubberMatch {
  return (
    match.kind === "rubber" &&
    // **Every deal of this rubber must be one we recorded a board for**, not merely
    // one of them. A rubber already under way when the boards started being kept comes
    // back from storage with none (see `restoreTable`) and then records boards for
    // whatever it plays next — so it ends with fewer boards than deals, and pairing
    // `previous[i]` against `history[i]` on the replay would line every deal up
    // against the wrong one. Counting is what makes that unreachable rather than
    // subtly wrong, and it subsumes the empty case.
    match.table.dealt.length === summarize(match.table).history.length &&
    match.table.replay.length === 0 &&
    summarize(match.table).rubber.complete
  );
}

/**
 * The same boards again, with the right to draw first handed to the other player.
 *
 * So you are offered the cards your opponent was offered and they get yours, which
 * is duplicate's mechanic reached without duplicate's scoring: the deals are shared
 * and the rubber is an ordinary rubber. What that gives up is *cancellation* — under
 * earned vulnerability the two runs of a board happen at different standings, so
 * their difference is not purely what the two players did. That is a property of
 * duplicate scoring rather than of repeated deals, and it is not the reason meeting
 * a board again is worth doing.
 *
 * Returns the match unchanged when there is nothing to return, so a caller that has
 * not checked `canReturn` cannot accidentally start a third run.
 */
export function returnMatch(match: MatchState): MatchState {
  if (!canReturn(match)) {
    return match;
  }
  const replay = mirrorOf(match.table.dealt);
  return {
    kind: "rubber",
    table: startTable({
      format: match.table.rubberBefore.format,
      previous: summarize(match.table).history,
      previousPoints: totalScore(summarize(match.table).rubber),
      replay,
      // Both are supplied by the replay's first board and are here only to satisfy
      // the ordinary path; `startTable` prefers the replay when it has one.
      seed: replay[0]!.seed,
      starter: replay[0]!.starter,
    }),
  };
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
      repeated: false,
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
    repeated: match.table.replay.length > 0,
    score: summary.score,
    standing: {
      history: summary.history,
      kind: "rubber",
      previous: match.table.previous,
      previousPoints: match.table.previousPoints,
      rubber: summary.rubber,
    },
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
