import { applyAction, startDeal } from "./deal.js";
import { duplicateScoreFor } from "./duplicate.js";
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
 * Who played a recorded result, which is not the same evidence in every case.
 *
 * Three can appear on a board and §1.8a keeps them apart deliberately: a score made
 * across the table from a person was shaped by that person, where a solo one was
 * made against the fixed opposition everybody else faced. All three count; the
 * traveller says which.
 */
export type FieldEntryKind = "computer" | "solo" | "table";

/**
 * One recorded result on a board — a whole deal, not a summary of several.
 *
 * **It is a real hand somebody played**, and that is a requirement rather than a
 * convenience: §1.8a shows the contract and the result beside the score, and the
 * moment an entry were an average of runs the line on screen and the number in the
 * ranking would come apart, with nothing on the page explaining the gap.
 *
 * `points` is the **net** from the seat holding this board's stream: what they
 * scored less what the other seat scored. Not their own total, which is what this
 * first stored and which quietly broke the ranking — the engine scores a deal the
 * rubber way, two non-negative totals with the defender on nothing, so defending a
 * contract that made exactly and defending one that made an overtrick both came out
 * **0** and tied. A board where the opposition always declares then handed every
 * entry the same score and every player 50%, with every difference between them
 * erased before the matchpoints saw it.
 *
 * **It is not the same hand this seat held.** The recorded result faced the same
 * twenty-six offers and made its own keep-or-reject decisions, so whatever displays
 * one has to say so.
 */
export interface FieldEntry {
  readonly contract: Contract | null;
  readonly kind: FieldEntryKind;
  readonly points: number;
  readonly tricks: Pair<number> | null;
  /** What to call whoever made it. "Computer" for a generated run. */
  readonly who: string;
}

/** A board this session has finished, and the field it is ranked against. */
export interface FieldResult {
  readonly board: FieldBoard;
  readonly contract: Contract | null;
  /**
   * Everybody else's results on this board, or null until they arrive.
   *
   * Null is a board played and not yet ranked rather than a board nobody else has
   * played — §1.8a withholds the field until the deal is over, and it may never turn
   * up. An empty list is the other thing: a board whose only result is this one.
   */
  readonly field: readonly FieldEntry[] | null;
  /** Each seat's whole score for the deal, bonus included, exactly as duplicate pays it. */
  readonly points: Pair<number>;
  readonly tricks: Pair<number>;
}

/**
 * What a board came to for one seat, the way duplicate counts it.
 *
 * Their score less the other seat's, so defence is scored at all: a defender's own
 * total is nought whether the contract scraped home or ran away with an overtrick,
 * and a ranking built on that cannot tell the two apart.
 */
export function netFor(points: Pair<number>, me: PlayerId): number {
  return points[me] - points[me === 0 ? 1 : 0];
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
}

export interface StartFieldOptions {
  readonly boards: readonly FieldBoard[];
  readonly me: PlayerId;
}

export function startField({ boards, me }: StartFieldOptions): FieldState {
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
        field: null,
        points: score === null ? [0, 0] : score.points,
        tricks: state.deal.tricksWon,
      },
    ],
  };
}

/**
 * Folds a board's field in, whenever it turns up.
 *
 * Keyed by the board's id rather than by position, because the fetch is not on the
 * critical path and may well land after the next board has been dealt — or after two
 * more have. A field for a board this session does not hold is ignored rather than
 * refused: it can only mean a stale response.
 */
export function withField(
  state: FieldState,
  boardId: string,
  field: readonly FieldEntry[],
): FieldState {
  if (!state.results.some((one) => one.board.id === boardId && one.field === null)) {
    return state;
  }
  return {
    ...state,
    results: state.results.map((one) =>
      one.board.id === boardId && one.field === null ? { ...one, field } : one,
    ),
  };
}

/**
 * Matchpoints: two for every result beaten, one for every result tied, as a
 * percentage of the most that were available.
 *
 * The whole of §1.8a's scoring. A percentage rather than a raw count because field
 * sizes vary — a board three people have played holds more results than an untouched
 * one — and a count of results beaten is not comparable across two boards with
 * different fields where a percentage is.
 *
 * Null for an empty field, which is a board nobody else has played rather than a
 * board scored zero. Everything downstream has to keep those apart, the same
 * distinction duplicate's pad draws between a zero and a blank.
 */
export function matchpointsOf(points: number, against: readonly FieldEntry[]): number | null {
  if (against.length === 0) {
    return null;
  }
  const scored = against.reduce(
    (total, one) => total + (points > one.points ? 2 : points === one.points ? 1 : 0),
    0,
  );
  return (scored / (2 * against.length)) * 100;
}

/**
 * Where this seat placed on a board, as a percentage.
 *
 * Null while the field is missing or empty — a board played and not yet ranked. The
 * caller decides what to draw for that; what it must not do is read as nought.
 */
export function boardPercentageOf(result: FieldResult, me: PlayerId): number | null {
  return result.field === null ? null : matchpointsOf(netFor(result.points, me), result.field);
}

/**
 * The same, counting only results a person made.
 *
 * §1.8a: a high percentage against seven machine runs and one person means "better
 * than the computer usually manages on this stock", where the same figure against
 * six people means something else entirely, and a bare percentage cannot tell them
 * apart. Null until somebody else has played the board, which reads as "nobody to
 * compare with yet" rather than as a zero.
 */
export function humanPercentageOf(result: FieldResult, me: PlayerId): number | null {
  if (result.field === null) {
    return null;
  }
  return matchpointsOf(
    netFor(result.points, me),
    result.field.filter((one) => one.kind !== "computer"),
  );
}

export interface FieldSummary {
  /** Boards whose field has arrived and is not empty — what `percentage` is over. */
  readonly boardsRanked: number;
  /** Boards played, whether or not their field has arrived. */
  readonly boardsPlayed: number;
  readonly complete: boolean;
  /**
   * The session so far, as the mean of its boards' percentages.
   *
   * The mean rather than a total, because a session's boards need not all have a
   * field yet and a running total would quietly punish a board whose results have
   * not come back. Null until at least one board has been ranked.
   */
  readonly percentage: number | null;
  /** The same over people's results alone. Null until there are any. */
  readonly humanPercentage: number | null;
  readonly results: readonly FieldResult[];
  /** The deal on the table, once it is complete and was not passed out. */
  readonly score: ReturnType<typeof duplicateScoreFor>;
  /** Prescribed by the board on the table, or by the last one at the end of a session. */
  readonly vulnerable: Pair<boolean>;
}

function meanOf(values: readonly (number | null)[]): number | null {
  const found = values.filter((one): one is number => one !== null);
  return found.length === 0
    ? null
    : found.reduce((total, one) => total + one, 0) / found.length;
}

export function summarizeField(state: FieldState): FieldSummary {
  // Nothing to fold in: a board is committed by the action that finishes it, so the
  // session moves as it is played and the last board is in `results` like every
  // other. That is the whole reason the commit moved off this function.
  const board = state.boards[state.at] ?? state.boards[state.boards.length - 1]!;
  const placings = state.results.map((one) => boardPercentageOf(one, state.me));
  return {
    boardsPlayed: state.results.length,
    boardsRanked: placings.filter((one) => one !== null).length,
    complete: state.results.length >= state.boards.length,
    humanPercentage: meanOf(state.results.map((one) => humanPercentageOf(one, state.me))),
    percentage: meanOf(placings),
    results: state.results,
    score: duplicateScoreFor(state.deal, board.vulnerable),
    vulnerable: board.vulnerable,
  };
}
