import { applyAction, startDeal } from "./deal.js";
import { duplicateScoreFor, impsFor } from "./duplicate.js";
import type { DuplicateScoring } from "./duplicate.js";
import type { Contract, DealAction, DealState, Pair, PlayerId } from "./types.js";

/**
 * Duplicate against the field — §1.8a.
 *
 * The second flavour of §1.8, and it shares almost everything with the first: a
 * board is a seed, vulnerability is prescribed, a deal settles where it is played,
 * and a board is worth one signed figure read through the same points-or-IMPs
 * setting. **What differs is where the other side of the comparison comes from.**
 * A session plays each board twice and compares the two runs; this plays each board
 * once and compares it against results already recorded on that board.
 *
 * So the state here is simpler than `DuplicateState` rather than more complicated:
 * there is no schedule, no replay, no board played twice and therefore no even rule
 * on the count. What it has instead is a **reference that arrives late**, because a
 * board's history names the contract and says how it went, which is the largest hint
 * anybody could be handed about a deal they are about to bid. It is fetched once the
 * deal is over and folded in with `withReference`.
 *
 * The session knows which seat the person holds. That is not the engine learning
 * who the human is — it is the format being solo by construction, so exactly one
 * seat's score is being compared against anything and the other is the opposition's.
 */

/**
 * One board: a stock, who draws first on it, and what it is played at.
 *
 * `starter` is what makes a board one *side* of a stock rather than the stock —
 * §1.8a's two streams are the same seed dealt from either end, and the two carry
 * their own recorded results. The person always sits in the same seat, so which
 * stream they are handed is exactly which seat starts.
 *
 * `vulnerable` is carried rather than derived, so a board is always played at the
 * vulnerability its recorded results were played at and nothing can drift it.
 */
export interface FieldBoard {
  /** The corpus's own identifier, which is what a result is reported against. */
  readonly id: string;
  readonly seed: number;
  readonly starter: PlayerId;
  readonly vulnerable: Pair<boolean>;
}

/**
 * What a board's recorded history came to, once it is allowed to be seen.
 *
 * `points` is from the seat being scored, so the caller is responsible for asking
 * for the stream this board was played from — the engine compares seat-indexed
 * numbers and cannot check that for anybody.
 *
 * `contract` and `tricks` are one representative recorded deal rather than a
 * property of the average, and they are here because a bare pair of numbers says
 * far less than a contract does. **They are not the same hand this seat held**: the
 * recorded result faced the same twenty-six offers and made its own keep-or-reject
 * decisions, so whatever displays these has to say so.
 */
export interface FieldReference {
  readonly contract: Contract | null;
  /** How many recorded results the figure is over. One is the generated entry alone. */
  readonly entries: number;
  readonly points: number;
  readonly tricks: Pair<number> | null;
}

/** A board this session has finished, and what it was worth once the history landed. */
export interface FieldResult {
  readonly board: FieldBoard;
  readonly contract: Contract | null;
  /** Each seat's whole score for the deal, bonus included, exactly as duplicate pays it. */
  readonly points: Pair<number>;
  /** Null until the history arrives, and null forever if it never does. */
  readonly reference: FieldReference | null;
  readonly tricks: Pair<number>;
}

export interface FieldState {
  /**
   * Which board is on the table.
   *
   * `results.length` is `at` while it is being played and `at + 1` once it is done,
   * which is what "already committed" reads — see `commitField`.
   */
  readonly at: number;
  readonly boards: readonly FieldBoard[];
  readonly deal: DealState;
  /** The seat whose score is being compared. The other seat is the opposition. */
  readonly me: PlayerId;
  readonly results: readonly FieldResult[];
  readonly scoring: DuplicateScoring;
}

export interface StartFieldOptions {
  readonly boards: readonly FieldBoard[];
  readonly me: PlayerId;
  readonly scoring?: DuplicateScoring;
}

export function startField({ boards, me, scoring = "points" }: StartFieldOptions): FieldState {
  const first = boards[0];
  if (first === undefined) {
    throw new Error("a field session needs at least one board");
  }
  return {
    at: 0,
    boards,
    deal: startDeal({ seed: first.seed, starter: first.starter }),
    me,
    results: [],
    scoring,
  };
}

/**
 * Applies an action, and commits the board the moment its deal completes.
 *
 * **Committed here rather than when the next board is dealt**, which is where the
 * session keeps its equivalent and is the one place that arrangement goes wrong: the
 * last deal of a session is completed and then *left* on the table, because nothing
 * deals a board after it. A result that only exists once you move on is a result the
 * final board never has — so the reference for it could never be attached, and the
 * session's own last board would be the one board it could not compare.
 */
export function applyFieldAction(
  state: FieldState,
  player: PlayerId,
  action: DealAction,
): FieldState {
  const played = { ...state, deal: applyAction(state.deal, player, action) };
  return played.deal.phase === "complete" ? commitField(played) : played;
}

/** The board on the table, which is the one a reference would be fetched for. */
export function currentFieldBoard(state: FieldState): FieldBoard | null {
  return state.boards[state.at] ?? null;
}

/**
 * Deals the next board, or leaves a finished session alone.
 *
 * The board just played is already committed — `applyFieldAction` does that the
 * moment its deal completes — so this only advances. Calling it twice at the end is
 * a no-op rather than a third run onto the last board, which is the shape of bug the
 * session had.
 */
export function nextFieldDeal(state: FieldState): FieldState {
  const at = state.at + 1;
  const next = state.boards[at];
  if (next === undefined) {
    return state;
  }
  return { ...state, at, deal: startDeal({ seed: next.seed, starter: next.starter }) };
}

/**
 * Records what the board on the table came to.
 *
 * Carries no reference: one may not have arrived yet, and a session must never be
 * held up waiting for one — §1.8a requires the deal scored and the comparison blank
 * rather than the other way round.
 *
 * `results[i]` describes `boards[i]`, so "already committed" is `results.length >
 * at` and nothing has to remember whether this ran twice.
 */
function commitField(state: FieldState): FieldState {
  const board = state.boards[state.at];
  if (board === undefined || state.deal.phase !== "complete" || state.results.length > state.at) {
    return state;
  }
  const score = duplicateScoreFor(state.deal, board.vulnerable);
  return {
    ...state,
    results: [
      ...state.results,
      {
        board,
        contract: state.deal.contract,
        points: score === null ? [0, 0] : score.points,
        reference: null,
        tricks: state.deal.tricksWon,
      },
    ],
  };
}

/**
 * Folds a board's history in, whenever it turns up.
 *
 * Keyed by the board's id rather than by position, because the fetch is not on the
 * critical path and may well land after the next board has been dealt — or after
 * two more have. A reference for a board this session does not hold is ignored
 * rather than refused: it can only mean a stale response.
 */
export function withReference(
  state: FieldState,
  boardId: string,
  reference: FieldReference,
): FieldState {
  if (!state.results.some((one) => one.board.id === boardId && one.reference === null)) {
    return state;
  }
  return {
    ...state,
    results: state.results.map((one) =>
      one.board.id === boardId && one.reference === null ? { ...one, reference } : one,
    ),
  };
}

/**
 * What a board came to: this seat's score against what the history got on it.
 *
 * Null while the history is missing, which is a board played and not yet compared
 * rather than a board worth nothing. Everything downstream has to keep those two
 * apart — the same distinction duplicate's pad draws between a zero and a blank.
 */
export function fieldMarginOf(
  result: FieldResult,
  me: PlayerId,
  scoring: DuplicateScoring,
): number | null {
  if (result.reference === null) {
    return null;
  }
  const difference = result.points[me] - result.reference.points;
  // `impsFor` already carries the sign through. Multiplying by `Math.sign` as well
  // reads as belt and braces and is a double negation: a board lost by 500 came back
  // as +11 IMPs, which a test caught and reading the call site would not have.
  return scoring === "imps" ? impsFor(difference) : Math.round(difference);
}

export interface FieldSummary {
  /** Boards whose history has arrived, which is what `margin` is over. */
  readonly boardsCompared: number;
  /** Boards played, whether or not their history has arrived. */
  readonly boardsPlayed: number;
  readonly complete: boolean;
  /** The session's running total against the field, in whatever it is being scored in. */
  readonly margin: number;
  readonly results: readonly FieldResult[];
  /** The deal on the table, once it is complete and was not passed out. */
  readonly score: ReturnType<typeof duplicateScoreFor>;
  /**
   * What `margin` is denominated in, carried rather than inferred.
   *
   * A pad drawing these figures has to name the currency, and a margin in IMPs and one
   * in points are not distinguishable by size — a session can genuinely be +14 either
   * way. Guessing is how two surfaces come to disagree about what a number means.
   */
  readonly scoring: DuplicateScoring;
  /** Prescribed by the board on the table, or by the last one at the end of a session. */
  readonly vulnerable: Pair<boolean>;
}

export function summarizeField(state: FieldState): FieldSummary {
  // Nothing to fold in: a board is committed by the action that finishes it, so the
  // total already moves as the session is played and the last board is in `results`
  // like every other. That is the whole reason the commit moved off this function.
  const folded = state;
  const compared = folded.results.filter((one) => one.reference !== null);
  const board = state.boards[state.at] ?? state.boards[state.boards.length - 1]!;
  return {
    boardsCompared: compared.length,
    boardsPlayed: folded.results.length,
    complete: folded.results.length >= folded.boards.length,
    margin: compared.reduce(
      (total, one) => total + (fieldMarginOf(one, folded.me, folded.scoring) ?? 0),
      0,
    ),
    results: folded.results,
    score: duplicateScoreFor(state.deal, board.vulnerable),
    scoring: folded.scoring,
    vulnerable: board.vulnerable,
  };
}
