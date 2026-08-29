import { opponentOf } from "./cards.js";
import { applyAction, startDeal } from "./deal.js";
import { applyDealScore, newRubber, vulnerability } from "./rubber.js";
import { scoreDeal } from "./scoring.js";
import type { DealScore } from "./scoring.js";
import type { RubberFormat, RubberState } from "./rubber.js";
import type { DealtBoard } from "./returnMatch.js";
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
  /**
   * Who drew first, which is what identifies a *stock* rather than a seat.
   *
   * Flipping the starter swaps which player draws first, but the first drawer still
   * gets the same cards — so on a board played twice, "the first drawer's cards" is
   * one holding with a stable identity, held by one player the first time and the
   * other the second. That is the handle a replay's scorepad compares along, and
   * without it the pad has no truthful way to say which hand was whose.
   *
   * Safe to project, unlike the seed beside it in `TableState`: both players watch
   * the draw and know perfectly well who went first.
   */
  readonly starter: PlayerId;
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
  /**
   * What every deal of this rubber was dealt from, oldest first, the deal on the
   * table included. What a return match replays.
   *
   * Here rather than on `DealRecord` because the records are projected to the
   * client inside `MatchStanding` and a seed reconstructs a whole stock order.
   * `TableState` is never sent.
   */
  readonly dealt: readonly DealtBoard[];
  readonly played: readonly DealRecord[];
  /**
   * The earlier match's scorepad, when this is a return match. Empty otherwise.
   *
   * **Read with the seats swapped, which is the whole reason it is worth showing.**
   * A return match hands each seat the stream the other faced, so `previous[i]`'s
   * points reversed are what *these* cards made the first time round — a
   * like-for-like comparison, where reading it unreversed would compare a seat
   * against itself holding different cards.
   */
  readonly previous: readonly DealRecord[];
  /**
   * What the match being replayed finally came to, per seat. Null unless this is a
   * return match.
   *
   * Kept as a total rather than re-derived from `previous`, because a rubber's totals
   * are not the sum of its deals: `matchBonusFor` pays 500 or 700 for winning it, and
   * that lands on the rubber rather than on any deal in it. Summing the scorepad would
   * be short by the bonus and short in a way nobody would notice.
   *
   * Read **unreversed**, unlike everything else about a return match. Per deal the
   * unit is the cards, so a seat is compared against whoever held them; across a whole
   * match each player has had both sides of every board, so the totals compare the
   * players.
   */
  readonly previousPoints: Pair<number> | null;
  /**
   * Boards this rubber must deal, in order, because it is a return match.
   *
   * Empty for an ordinary rubber, which is also what says a rubber may still be
   * *offered* a return match: replaying a replay is playing the same cards a third
   * time, which is nobody's idea of a game.
   *
   * **It runs out about two rubbers in five and that is a main path, not an edge
   * case.** The second rubber ends when somebody wins it, which need not be inside
   * the number of deals the first one took — measured over 400 pairs, the return
   * match ran longer 43% of the time. Past the end it simply deals fresh, which is
   * safe here in a way it would not be in duplicate: under rubber scoring a board
   * is not a scoring unit, so a board played once is not a score with nothing to
   * compare it against.
   */
  readonly replay: readonly DealtBoard[];
  readonly rubberBefore: RubberState;
}

export interface StartTableOptions {
  /** Defaults to a rubber, which is what this game was until it was not. */
  readonly format?: RubberFormat;
  /** The earlier match's scorepad, for a return match. */
  readonly previous?: readonly DealRecord[];
  /** What the earlier match finally came to, for a return match. */
  readonly previousPoints?: Pair<number> | null;
  /** Boards to replay, for a return match. The first is dealt in place of `seed`. */
  readonly replay?: readonly DealtBoard[];
  readonly seed: number;
  readonly starter: PlayerId;
}

export function startTable(options: StartTableOptions): TableState {
  const replay = options.replay ?? [];
  const first = replay[0] ?? { seed: options.seed, starter: options.starter };

  return {
    deal: startDeal(first),
    dealt: [first],
    played: [],
    previous: options.previous ?? [],
    previousPoints: options.previousPoints ?? null,
    replay,
    rubberBefore: newRubber(options.format ?? "rubber"),
  };
}

/**
 * A rubber as it may have been written to storage, which is not quite `TableState`.
 *
 * The four fields a return match needs post-date the storage format, and a Durable
 * Object holds a table across deploys — so a sitting that began before them comes back
 * without any of them. **This is not defensive coding, it is a bug that shipped**: with
 * `replay` undefined, `nextDeal` reads `table.replay[table.dealt.length]` off nothing
 * and throws, which takes out every action of a rubber already under way at a table.
 *
 * Repaired on read rather than by migrating storage, the same way `matchFrom` already
 * wraps a bare `TableState` and `withImpliedTiers` repairs a stored achievement: the
 * old shape stays where it is and the answer comes out right anyway.
 */
export type StoredTable = Omit<
  TableState,
  "dealt" | "previous" | "previousPoints" | "replay"
> &
  Partial<Pick<TableState, "dealt" | "previous" | "previousPoints" | "replay">>;

/**
 * A stored rubber, with whatever it predates filled in.
 *
 * `dealt` comes back empty, which is the honest answer — nothing recorded what those
 * deals were dealt from, and nothing can now. `canReturn` reads it, so such a rubber
 * simply never offers to be played back, which is right: there is nothing to play.
 */
export function restoreTable(stored: StoredTable): TableState {
  return {
    ...stored,
    dealt: stored.dealt ?? [],
    previous: stored.previous ?? [],
    previousPoints: stored.previousPoints ?? null,
    replay: stored.replay ?? [],
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

  return {
    contract: state.contract,
    score,
    starter: state.starter,
    tricksWon: state.tricksWon,
    wonGameBy,
  };
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
  // The board this rubber owes next, when it is a return match and has not yet
  // run out. Its starter is already flipped — `mirrorOf` did that once, when the
  // return match began — so the alternation above is not consulted at all, which
  // is the point: it would diverge the first time either rubber passed a deal out.
  const owed = won ? undefined : table.replay[table.dealt.length];
  const next = owed ?? { seed, starter };

  return {
    deal: startDeal(next),
    // A rubber that has just been won is followed by a fresh one, so what it was
    // dealt from starts over — and so does the replay, since a new rubber after a
    // return match is an ordinary rubber that may be returned in its turn.
    dealt: won ? [next] : [...table.dealt, next],
    played: won ? [] : history,
    previous: won ? [] : table.previous,
    previousPoints: won ? null : table.previousPoints,
    replay: won ? [] : table.replay,
    // A new match is the same kind of match. The format is chosen when players
    // sit down, not per rubber, so it carries across.
    rubberBefore: won ? newRubber(rubber.format) : rubber,
  };
}
