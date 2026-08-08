import { opponentOf } from "./cards.js";
import { applyAction, startDeal } from "./deal.js";
import { applyDealScore, newRubber, vulnerability } from "./rubber.js";
import { scoreDeal } from "./scoring.js";
import type { DealScore } from "./scoring.js";
import type { MatchFormat, RubberState } from "./rubber.js";
import type { Contract, DealAction, DealState, Pair, PlayerId } from "./types.js";

/**
 * One deal's line on the scorepad.
 *
 * `RubberState` is deliberately aggregate — it knows the totals, not how they
 * were reached — so the running record is kept beside it. A rubber runs several
 * deals and the point of a scorepad is seeing how the standing arose.
 */
export interface DealRecord {
  /** Null when the deal was passed out and nothing was scored. */
  readonly contract: Contract | null;
  readonly score: DealScore | null;
  readonly tricksWon: Pair<number>;
  /** Set when this deal took a side past 100 below the line, so a line is ruled under it. */
  readonly wonGameBy: PlayerId | null;
}

/**
 * A rubber in progress: the deal on the table, the rubber behind it, and the
 * deals already scored into it.
 *
 * The engine's deal reducer covers one deal. This covers the sitting — which
 * deal, who draws first, what has been scored — and it exists here rather than
 * in whatever is hosting the game because there are two hosts. The browser runs
 * it for the game against the computer and the server runs it for a game
 * between two people, and a rubber that advanced differently in the two would
 * be the same class of bug as a rule that did.
 *
 * `rubberBefore` is the rubber as it stood when the current deal began, not the
 * rubber including it. Vulnerability is fixed for the duration of a deal, so
 * that is what the deal has to be scored against, and keeping the *before*
 * state means the current deal's score is derived rather than accumulated —
 * it cannot be applied twice however many times anything reads it.
 */
export interface TableState {
  readonly deal: DealState;
  readonly played: readonly DealRecord[];
  readonly rubberBefore: RubberState;
}

export interface StartTableOptions {
  /** Defaults to a rubber, which is what this game was until it was not. */
  readonly format?: MatchFormat;
  readonly seed: number;
  readonly starter: PlayerId;
}

export function startTable(options: StartTableOptions): TableState {
  return {
    deal: startDeal(options),
    played: [],
    rubberBefore: newRubber(options.format ?? "rubber"),
  };
}

export function applyTableAction(
  table: TableState,
  player: PlayerId,
  action: DealAction,
): TableState {
  return { ...table, deal: applyAction(table.deal, player, action) };
}

/** The finished deal's score, or null while it is still being played or was passed out. */
export function dealScoreFor(state: DealState, vulnerable: Pair<boolean>): DealScore | null {
  if (state.phase !== "complete" || state.contract === null || state.initialHands === null) {
    return null;
  }
  return scoreDeal(
    { contract: state.contract, hands: state.initialHands, tricksWon: state.tricksWon },
    vulnerable,
  );
}

/**
 * One scorepad line. `wonGameBy` is set by comparing the rubber either side of
 * the deal, which is what rules a line across the pad under it.
 */
export function recordFor(
  state: DealState,
  score: DealScore | null,
  before: RubberState,
  after: RubberState,
): DealRecord {
  const wonGameBy: PlayerId | null =
    after.gamesWon[0] > before.gamesWon[0] ? 0 : after.gamesWon[1] > before.gamesWon[1] ? 1 : null;

  return { contract: state.contract, score, tricksWon: state.tricksWon, wonGameBy };
}

/** Everything about the table that is worked out rather than stored. */
export interface TableSummary {
  /** Every deal of the rubber, oldest first, including the one just finished. */
  readonly history: readonly DealRecord[];
  /** The rubber including the deal just finished. */
  readonly rubber: RubberState;
  /** The current deal's score, once it is complete and was not passed out. */
  readonly score: DealScore | null;
  /** Vulnerability as it stood for the deal in progress or just finished. */
  readonly vulnerable: Pair<boolean>;
}

export function summarize(table: TableState): TableSummary {
  const vulnerable = vulnerability(table.rubberBefore);
  const score = dealScoreFor(table.deal, vulnerable);
  const rubber = score === null ? table.rubberBefore : applyDealScore(table.rubberBefore, score);
  const history =
    table.deal.phase === "complete"
      ? [...table.played, recordFor(table.deal, score, table.rubberBefore, rubber)]
      : table.played;

  return { history, rubber, score, vulnerable };
}

/**
 * Deals again, committing the finished deal to the scorepad and starting a
 * fresh rubber if the last one has been won.
 *
 * A deal passed out is redealt by the same player; otherwise the right to draw
 * first alternates, which is this game's deal rotation. The seed comes from the
 * caller because the engine owns no randomness — and because in a networked
 * game it must be generated server-side and never sent to a client.
 */
export function nextDeal(table: TableState, seed: number): TableState {
  const { history, rubber } = summarize(table);
  const won = rubber.complete;
  const starter = table.deal.passedOut ? table.deal.starter : opponentOf(table.deal.starter);

  return {
    deal: startDeal({ seed, starter }),
    played: won ? [] : history,
    // A new match is the same kind of match. The format is chosen when players
    // sit down, not per rubber, so it carries across.
    rubberBefore: won ? newRubber(rubber.format) : rubber,
  };
}
