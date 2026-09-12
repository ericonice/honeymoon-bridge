import { opponentOf } from "./cards.js";
import { applyAction, startDeal } from "./deal.js";
import { GAME_THRESHOLD } from "./rubber.js";
import type { RubberFormat } from "./rubber.js";
import { scoreDeal } from "./scoring.js";
import type { DealResult, DealScore } from "./scoring.js";
import { createRng, shuffle } from "./rng.js";
import type { Contract, DealAction, DealState, Pair, PlayerId } from "./types.js";

/**
 * Duplicate: the same stock played twice, once from each side.
 *
 * A board here is a **seed**, not a hand. Ordinary duplicate fixes the cards and
 * has different people play them; this game has no cards to fix — it has a stock
 * and 26 draw decisions that build the hands out of it. Two facts make the
 * comparison exact, and both are properties of the reducer rather than
 * conventions layered on top of it:
 *
 *  - a turn spends exactly two stock cards and turns alternate unconditionally,
 *    so **each seat's thirteen offers are fixed by the seed** and cannot be
 *    perturbed by anything either player does;
 *  - `startDeal` hands the starter the first pair, so **flipping the starter
 *    swaps the two streams exactly**.
 *
 * So a board is played twice with the starter reversed, and the difference
 * between the two results is what the players did with one stock rather than what
 * the stock did to them.
 */

/**
 * What is being played.
 *
 * The wide vocabulary, and the one every screen, record and stored row uses.
 * `RubberFormat` is the narrow one — it answers "what does it take to finish a
 * rubber", one game or two — and a duplicate session is not a rubber at all, so
 * `RubberState` keeps the narrow type and nothing has to invent a meaning for a
 * rubber that is a duplicate.
 *
 * It lives here rather than beside `RubberFormat` because this is what widened
 * it. `rubber.ts` knowing about duplicate would be the wrong way round.
 */
export type MatchFormat = RubberFormat | "duplicate" | "mirror";

/** Boards in a session. Also the average gap between a board's two runs — see `scheduleFor`. */
export const BOARDS_PER_SESSION = 5;

/** Deals in a session of this many boards. Every board is played twice, and that is the whole of it. */
export function dealsFor(boards: number): number {
  return boards * 2;
}

/**
 * Boards in a session of this many deals — the direction a player asks in.
 *
 * A session's length is naturally a *deal* count, because "how long is this game"
 * is the question and a rubber is experienced the same way. The engine's unit is
 * the board, because a session *is* a list of boards. So the conversion lives
 * here, once, rather than as a doubling scattered across whatever reads a
 * preference.
 *
 * **A deal count has to be even**, and that is a rule rather than an
 * inconvenience: seven deals is not a short session, it is a session with one
 * board played once — and a board played once is a score with nothing to compare
 * it against, which is the one thing this format cannot have. An odd count is
 * rounded rather than refused, since it can only arrive from a stored preference
 * and a preference is not an action.
 */
export function boardsForDeals(deals: number): number {
  return Math.max(1, Math.round(deals / 2));
}

/**
 * How much of the average gap the *worst* gap is allowed to be.
 *
 * The replay order is random, which is what makes withholding a board's identity
 * worth anything — under a fixed order the identity is implicit in the count. The
 * cost is that gaps stop being uniform, and a board replayed immediately after
 * its own first run is played with near-perfect recall, which is worse than
 * anything a fixed order can produce. So the board count sets the average gap and
 * this sets the worst one, as a *fraction* of it.
 *
 * **A fraction rather than a fixed number of deals, and that is what the board
 * count being configurable forced.** A flat floor does not compose with a
 * variable count: at three boards a floor of three admits only the identity
 * permutation, so the schedule stops being random at all, while at ten boards the
 * same floor allows a board back after three deals when the average is ten. The
 * floor has to scale with what it is a floor *on*.
 */
const MIN_GAP_SHARE = 0.6;

/**
 * The fewest deals that may separate a board's two runs, for a session this long.
 *
 * Never above the board count, which is what keeps a schedule satisfiable: the
 * last board of the first half is replayed at best one slot into the second, so
 * the tightest gap any schedule can offer is exactly the board count. At equality
 * only the identity permutation survives, so the share is kept well below one.
 */
export function minGapFor(boards: number): number {
  return Math.max(1, Math.min(boards, Math.ceil(boards * MIN_GAP_SHARE)));
}

/** A part-score, in duplicate, is worth a flat bonus rather than progress toward anything. */
export const PART_SCORE_BONUS = 50;

/** Bidding and making a game is worth this at once, since there is no rubber to bank it toward. */
export const DUPLICATE_GAME_BONUS = 300;
export const DUPLICATE_GAME_BONUS_VULNERABLE = 500;

/**
 * One board of a session: the seed it is dealt from and who draws first the
 * first time it is played.
 *
 * The seed is the board *number* as well — board 47 is `{ seed: 47 }` — which is
 * what makes a board quotable and a session reconstructable. mulberry32 mixes
 * twice before its first output, so consecutive small seeds give unrelated
 * shuffles and there is nothing to gain by hashing them first.
 */
export interface DuplicateBoard {
  readonly seed: number;
  /** The replay gives the first draw to the other seat, which is the whole mechanic. */
  readonly starter: PlayerId;
}

/** One deal of a session: which board it plays, and whether it is that board's second run. */
export interface DuplicateDeal {
  /** Index into `DuplicateState.boards`. */
  readonly board: number;
  readonly replay: boolean;
}

/**
 * What one run of a board came to, signed toward whoever drew first *on that run*.
 *
 * One signed number rather than a pair, because that is what makes a board
 * comparable: the two runs are the same stock from opposite sides, so the
 * difference between their two numbers is the whole of what the board says. The
 * full breakdown rides along for a scorepad that wants the parts.
 */
export interface DuplicateResult {
  readonly board: number;
  /** Null when the deal was passed out and nothing was scored. */
  readonly contract: Contract | null;
  readonly points: number;
  readonly replay: boolean;
  readonly score: DuplicateDealScore | null;
  readonly tricksWon: Pair<number>;
}

export interface DuplicateDealScore {
  /** A game, a part-score, or nothing at all when the contract failed. */
  readonly bonus: number;
  /** The rubber-scoring breakdown this is built from, so nothing restates a scoring rule. */
  readonly deal: DealScore;
  /** Each seat's whole score for the deal, bonus included. */
  readonly points: Pair<number>;
}

/**
 * A duplicate session in progress.
 *
 * A sibling of `TableState` rather than a variant of it. A rubber accumulates
 * toward games and carries a part-score forward; a session is a fixed list of
 * boards, each scored on its own and compared against its own other run. There
 * is no standing to be a game up in, which is exactly why the bidder needs its
 * own objective for this format.
 *
 * `at` indexes `schedule`, and `results` holds one entry per deal already
 * finished — so `results[i]` describes `schedule[i]` and the deal on the table is
 * `schedule[at]`. Nothing is derived from a running total: a board's margin is
 * computed from its two results whenever anybody asks, which is the same reason
 * `TableState` keeps `rubberBefore` rather than accumulating.
 */
export interface DuplicateState {
  readonly at: number;
  readonly boards: readonly DuplicateBoard[];
  readonly deal: DealState;
  readonly results: readonly DuplicateResult[];
  readonly schedule: readonly DuplicateDeal[];
  /**
   * What was actually asked for when this session started — set once, here,
   * and never recomputed.
   *
   * Optional only for a session already in storage from before this field
   * existed; `scheduleKindOf` is the fallback for exactly that case, and nothing
   * new should ever need it. A schedule's *shape* cannot stand in for this: a
   * genuine shuffle lands looking like `halves` (every first run before every
   * replay) close to a quarter of the time, purely by chance, and that reading
   * used to feed straight back into `nextIn` when the session finished — so a
   * `random` session that happened to shuffle into that shape would silently
   * stop being random from its very next continuation onward, forever, since
   * nothing distinguished "genuinely halves" from "random that looked like it".
   * Recording the request once removes the guess entirely rather than
   * narrowing it.
   */
  readonly scheduleKind?: DuplicateSchedule;
  /**
   * What was asked for when this session started — set once, here, and never
   * recomputed, the same reason `scheduleKind` is. Optional for the same
   * reason too: a session in storage from before this field existed has
   * nothing to fall back on but "points", since IMPs did not exist as a
   * choice yet — unlike a schedule's shape, there is no reading of old data
   * that could mean anything else.
   */
  readonly scoring?: DuplicateScoring;
}

export interface StartDuplicateOptions {
  /** Defaults to `BOARDS_PER_SESSION`. The session is twice this many deals. */
  readonly boards?: number;
  /**
   * Overrides the floor `minGapFor` would derive. For a bench or a test that
   * wants a schedule shape of its own; nothing in the app passes it, because the
   * floor is a consequence of the board count rather than a second choice.
   */
  readonly minGap?: number;
  /**
   * Where the board numbers start. Board numbers are seeds, so this is also what
   * decides the deals — a session nobody can reconstruct is one whose boards
   * cannot be re-scored, so the caller owns this and records it.
   */
  readonly firstBoard: number;
  /** Seeds the replay order alone. Separate from the board seeds, which are the board numbers. */
  readonly scheduleSeed: number;
  /** How the deals are ordered. Defaults to `halves`. */
  readonly schedule?: DuplicateSchedule;
  /** How the margin and winner are read off the boards. Defaults to `points`. */
  readonly scoring?: DuplicateScoring;
  /** Who draws first on the session's first board. It alternates from there. */
  readonly starter: PlayerId;
}

/**
 * Which seats are vulnerable on a board, by the board's place in the session.
 *
 * Prescribed rather than earned, because there is no game to have won. Two
 * properties are load-bearing and neither is decoration: it is **the same on
 * both runs of a board**, and it attaches to the **position** — whoever draws
 * first — rather than to a person. Together those are what make it cancel out of
 * the comparison, since whoever sits in the vulnerable seat is vulnerable in both
 * runs.
 *
 * The four-board cycle is duplicate bridge's own, shortened: neither, the first
 * drawer, the second drawer, both.
 */
export function vulnerableFor(
  board: DuplicateBoard,
  index: number,
  replay: boolean,
): Pair<boolean> {
  // **Resolved against the run being played, not against the board's own starter.**
  //
  // This read `board.starter` and was wrong in the way the doc comment above says it
  // must not be: that is a fixed *player*, so the same person was vulnerable on both
  // runs — and since the replay hands them the second draw, the vulnerable seat sat
  // in a different position each time and the two runs stopped being mirror images.
  // Boards on the vulnerable rungs of the cycle then failed to cancel at all.
  //
  // Found by the control run once it was driven by a policy that *bids*. The dull
  // driver passes most deals out, and a passed-out deal scores nothing whether
  // anybody is vulnerable or not — so the original control was passing vacuously
  // with respect to vulnerability, which is worth remembering about every control:
  // it only tests what the driver actually exercises.
  const first = starterFor(board, replay);
  const second = opponentOf(first);
  const vulnerable: Pair<boolean> = [false, false];
  const phase = index % 4;

  if (phase === 1 || phase === 3) {
    vulnerable[first] = true;
  }
  if (phase === 2 || phase === 3) {
    vulnerable[second] = true;
  }
  return vulnerable;
}

/** Who draws first on a given run of a board. The replay is the mirror image. */
export function starterFor(board: DuplicateBoard, replay: boolean): PlayerId {
  return replay ? opponentOf(board.starter) : board.starter;
}

/**
 * What a made contract is worth beyond its trick score.
 *
 * Read off the below-the-line total rather than off the level and strain, so it
 * agrees with `rubber.ts` about what reaches a game — including a doubled
 * part-score that gets there on the multiplier alone, which is a real case and
 * the one a table of levels would get wrong.
 */
export function bonusFor(belowLine: number, vulnerable: boolean): number {
  if (belowLine < GAME_THRESHOLD) {
    return PART_SCORE_BONUS;
  }
  return vulnerable ? DUPLICATE_GAME_BONUS_VULNERABLE : DUPLICATE_GAME_BONUS;
}

/**
 * One deal, scored the duplicate way: everything settled now, nothing carried.
 *
 * Built on `scoreDeal` rather than beside it. Every figure a deal earns —
 * contract tricks, overtricks, the doubled insult, slams, penalties, honors — is
 * the same in both formats and is already stated once; what differs is only that
 * a game is paid for immediately instead of banked toward a rubber. So this adds
 * one term and restates nothing.
 *
 * **Honors stay in, against duplicate bridge's own practice.** Real duplicate
 * drops them because four aces is pure luck of the deal. Here it is not — a hand
 * is built over 26 decisions, so holding four aces is something a player did.
 */
export function scoreDuplicateDeal(
  result: DealResult,
  vulnerable: Pair<boolean>,
): DuplicateDealScore {
  const { declarer } = result.contract;
  return duplicateFrom(scoreDeal(result, vulnerable), declarer, vulnerable[declarer]);
}

/**
 * The same, from a deal already scored the rubber way.
 *
 * Split out because the bidder has the `DealScore` in hand already: `bidValue.ts`
 * prices fourteen outcomes per candidate contract inside a deadline-bounded
 * search, and scoring each of them twice to add one term would be a real cost in
 * the one place that cannot afford one.
 */
export function duplicateFrom(
  deal: DealScore,
  declarer: PlayerId,
  declarerVulnerable: boolean,
): DuplicateDealScore {
  const points: Pair<number> = [
    deal.aboveLine[0] + deal.belowLine[0],
    deal.aboveLine[1] + deal.belowLine[1],
  ];

  // No bonus at all for a contract that went down: the defenders' penalty is the
  // whole of what the deal paid, which is what makes overreaching expensive here
  // without any rule saying so.
  const bonus = deal.detail.made ? bonusFor(deal.belowLine[declarer], declarerVulnerable) : 0;
  points[declarer] += bonus;

  return { bonus, deal, points };
}

/**
 * How a session orders its deals.
 *
 * Four genuinely different games rather than cosmetic orderings, because what
 * changes is how much of a board you can still remember when it comes round —
 * and, separately, whether you can tell *which* board is coming back at all:
 *
 *  - `adjacent` plays a board's two runs back to back. The comparison is immediate
 *    and recall is complete, so the board turns purely on what each side did with the
 *    same stock — the clearest statement of what duplicate *is*, and no test of
 *    memory at all.
 *  - `sequence` plays every board once, then replays them in that same fixed order —
 *    a real gap to remember across, unlike `adjacent`, but which board is coming
 *    back is never in question the way it is under `halves`. The identity
 *    permutation `halves` falls back to when nothing shuffled satisfies its floor,
 *    made a first-class choice rather than an accident of that rejection loop.
 *  - `halves` plays every board once, then replays them in a random order with a
 *    floor on how soon one may come back. Memory matters most here, and working out
 *    which board you are on is part of it.
 *  - `random` shuffles the lot. A board's replay may land anywhere after its first
 *    run, immediately included — no floor, because being completely random is the
 *    point of asking for it.
 */
export type DuplicateSchedule = "adjacent" | "halves" | "random" | "sequence";

/**
 * How a session's margin and winner are read off its boards.
 *
 * Points sums each board's own margin, which is what makes it move on every
 * deal rather than waiting for a board to close — see `DuplicateSummary.margin`'s
 * own doc. IMPs converts each **closed** board's margin through `impsFor` before
 * summing, which is the whole reason it cannot move any sooner than points'
 * "closed" reading does: a lone first run has no second run to compare it
 * against yet, and IMPs has nothing else to convert.
 */
export type DuplicateScoring = "imps" | "points";

/**
 * The order a session's deals are played in.
 *
 * `minGap` applies to `halves` alone. Under `adjacent` a board comes back at once by
 * definition, under `sequence` the gap is always the full board count by definition,
 * and under `random` a floor is the thing that would stop it being random — so in
 * none of the three is there anything for it to constrain.
 */
export function scheduleFor(
  boards: number,
  scheduleSeed: number,
  minGap: number,
  kind: DuplicateSchedule = "halves",
): DuplicateDeal[] {
  const order = Array.from({ length: boards }, (_unused, index) => index);

  if (kind === "adjacent") {
    return order.flatMap((board) => [
      { board, replay: false },
      { board, replay: true },
    ]);
  }

  if (kind === "sequence") {
    return [
      ...order.map((board) => ({ board, replay: false })),
      ...order.map((board) => ({ board, replay: true })),
    ];
  }

  const rng = createRng(scheduleSeed);

  if (kind === "random") {
    // Every board twice, shuffled — and *which* run is which falls out of the order
    // rather than being decided: whichever of a board's two entries lands first is
    // its first run. So no arrangement of this list can be invalid, which is why this
    // needs no rejection step where `halves` does.
    const seen = new Set<number>();
    return shuffle([...order, ...order], rng).map((board) => {
      const replay = seen.has(board);
      seen.add(board);
      return { board, replay };
    });
  }

  const first: DuplicateDeal[] = order.map((board) => ({ board, replay: false }));

  // Rejection-sampled rather than constructed, because the constraint is easy to
  // state and awkward to build directly — and because the identity permutation always
  // satisfies it, every gap being exactly the board count, which gives a
  // guaranteed-valid fallback rather than an unbounded loop. The cap is far above what
  // any sane pairing of the two constants needs; hitting it means the floor is too
  // near the board count, and the fixed order is the honest answer then.
  let replayOrder = order;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = shuffle(order, rng);
    // Board `b` is played at position `b` and replayed at `boards + slot`.
    if (candidate.every((board, slot) => boards + slot - board >= minGap)) {
      replayOrder = candidate;
      break;
    }
  }

  return [...first, ...replayOrder.map((board) => ({ board, replay: true }))];
}

/**
 * Which order a session was dealt in, guessed from the shape of its schedule.
 *
 * **A fallback for a session already in storage from before `scheduleKind` was
 * recorded, and nothing else should call this.** It used to be the only
 * answer, on the reasoning that a schedule whose shape is ambiguous "would
 * deal identically either way" — true of the session it is asked about, and
 * false of the one asked next: `nextIn` fed this straight back in to decide
 * what the *next* session should be, so a `random` session that happened to
 * shuffle into a shape this cannot tell apart from `halves` or `sequence`
 * silently stopped being random from its next continuation on, every time,
 * with no way back short of leaving and choosing `random` again from
 * scratch. Adjacent is the shape that can be recognised exactly — every
 * replay directly follows its own first run. Nothing else can be: `random`
 * lands looking like the other two whenever the first half happens to hold
 * one first run of each board, which a genuine shuffle does close to a
 * quarter of the time, and `sequence` and `halves` share that same
 * first-half-then-second-half shape and are told apart only by whether the
 * replay half repeats the first half's board order exactly — which a
 * `halves` schedule does too, on the rare shuffle that lands on the identity
 * permutation. Guessing wrong in either direction reads as a different
 * format than the one asked for, which is exactly the bug `scheduleKind`
 * exists to remove for anything new.
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
  const first = schedule.slice(0, half);
  const second = schedule.slice(half);
  if (!first.every((entry) => !entry.replay)) {
    return "random";
  }
  return first.every((entry, index) => entry.board === second[index]?.board)
    ? "sequence"
    : "halves";
}

export function startDuplicate(options: StartDuplicateOptions): DuplicateState {
  // A session of no boards has no first deal to put on the table, and a caller
  // reading a stored preference is exactly the sort of thing that could ask for
  // one. Clamped rather than thrown: the number is a preference, not an action.
  const count = Math.max(1, Math.floor(options.boards ?? BOARDS_PER_SESSION));
  const boards: DuplicateBoard[] = Array.from({ length: count }, (_unused, index) => ({
    seed: options.firstBoard + index,
    // Alternating, so the first half of a session deals the way an ordinary
    // sitting does. It costs nothing either way — every board is played from both
    // sides — and a session where one player drew first five times running would
    // read as broken.
    starter: (index % 2 === 0 ? options.starter : opponentOf(options.starter)) as PlayerId,
  }));
  const scheduleKind = options.schedule ?? "halves";
  const schedule = scheduleFor(
    count,
    options.scheduleSeed,
    options.minGap ?? minGapFor(count),
    scheduleKind,
  );
  const opening = schedule[0]!;
  const board = boards[opening.board]!;

  return {
    at: 0,
    boards,
    deal: startDeal({ seed: board.seed, starter: starterFor(board, opening.replay) }),
    results: [],
    schedule,
    scheduleKind,
    scoring: options.scoring ?? "points",
  };
}

export function applyDuplicateAction(
  session: DuplicateState,
  player: PlayerId,
  action: DealAction,
): DuplicateState {
  return { ...session, deal: applyAction(session.deal, player, action) };
}

/** The board the deal on the table belongs to, and which run of it this is. */
export function currentDeal(session: DuplicateState): DuplicateDeal {
  return session.schedule[session.at]!;
}

export function boardOf(session: DuplicateState, deal: DuplicateDeal): DuplicateBoard {
  return session.boards[deal.board]!;
}

/** Vulnerability as it stands for the deal in progress or just finished. */
export function currentVulnerable(session: DuplicateState): Pair<boolean> {
  const deal = currentDeal(session);
  return vulnerableFor(boardOf(session, deal), deal.board, deal.replay);
}

/** The finished deal's score, or null while it is still being played or was passed out. */
export function duplicateScoreFor(
  state: DealState,
  vulnerable: Pair<boolean>,
): DuplicateDealScore | null {
  if (state.phase !== "complete" || state.contract === null || state.initialHands === null) {
    return null;
  }
  return scoreDuplicateDeal(
    { contract: state.contract, hands: state.initialHands, tricksWon: state.tricksWon },
    vulnerable,
  );
}

function resultFor(session: DuplicateState): DuplicateResult {
  const deal = currentDeal(session);
  const board = boardOf(session, deal);
  const score = duplicateScoreFor(session.deal, vulnerableFor(board, deal.board, deal.replay));
  const drewFirst = starterFor(board, deal.replay);

  return {
    board: deal.board,
    contract: session.deal.contract,
    // Signed toward whoever drew first on this run, which is what makes the two
    // runs of a board subtractable.
    points: score === null ? 0 : score.points[drewFirst] - score.points[opponentOf(drewFirst)],
    replay: deal.replay,
    score,
    tricksWon: session.deal.tricksWon,
  };
}

/**
 * A board once both of its runs are in: what each run came to, and the margin
 * between them.
 *
 * `margin` is signed toward the board's own `starter` — the seat that drew first
 * the first time it was played — because that is the seat both numbers are about.
 * `marginTo` converts to a fixed seat, which is what a session total needs, since
 * the boards alternate who draws first.
 */
export interface BoardOutcome {
  readonly board: number;
  /** Null until this board's second run has been played. */
  readonly margin: number | null;
  readonly played: readonly DuplicateResult[];
  readonly starter: PlayerId;
}

/**
 * One run's net, from a fixed seat rather than from whoever drew first on it.
 *
 * `DuplicateResult.points` is signed toward that run's own first drawer, which is
 * what makes the two runs subtractable and useless to read off a screen — it
 * changes whose side it is on halfway down a board. From one seat all the way
 * through, **a board's margin is the sum of its two runs**, which is why a scorepad
 * can show the arithmetic instead of asserting the answer.
 */
export function netTo(outcome: BoardOutcome, result: DuplicateResult, seat: PlayerId): number {
  return drewFirstOn(outcome, result) === seat ? result.points : 0 - result.points;
}

/** Who drew first on one run of a board. The replay hands it to the other seat. */
export function drewFirstOn(outcome: BoardOutcome, result: DuplicateResult): PlayerId {
  return result.replay ? opponentOf(outcome.starter) : outcome.starter;
}

/**
 * One run's real score for a fixed seat — not a margin, and not signed toward
 * whoever drew first. `DuplicateDealScore.points` is already indexed by the
 * fixed seat that played that run (see `resultFor`, which reads it the same
 * way to build the signed net), so this needs no `drewFirstOn` translation at
 * all: it is simply what that seat scored, honors and bonuses included, on a
 * run that may have been passed out and scored nothing.
 */
export function rawScoreTo(result: DuplicateResult, seat: PlayerId): number {
  return result.score === null ? 0 : result.score.points[seat];
}

/** A board's first-play run, or null before it has been played. */
export function firstPlayOf(outcome: BoardOutcome): DuplicateResult | null {
  return outcome.played.find((run) => !run.replay) ?? null;
}

/** A board's replay, or null before it has been played. */
export function replayOf(outcome: BoardOutcome): DuplicateResult | null {
  return outcome.played.find((run) => run.replay) ?? null;
}

export function marginTo(outcome: BoardOutcome, seat: PlayerId): number {
  if (outcome.margin === null) {
    return 0;
  }
  return seat === outcome.starter ? outcome.margin : 0 - outcome.margin;
}

/** Everything about the session that is worked out rather than stored. */
export interface DuplicateSummary {
  /** One entry per board, in board order, whether or not it is closed yet. */
  readonly boards: readonly BoardOutcome[];
  /**
   * The board on the table and whether this is its second run, or null once the
   * session is over.
   *
   * The `replay` half is the one thing a screen must be able to say during a
   * session and could not: whether this is a board you have seen. Which board it is
   * stays out of it — the replay order is random precisely so that identifying it is
   * the player's job, and a summary naming it would hand that back.
   */
  readonly current: DuplicateDeal | null;
  /** How many boards have both runs in. */
  readonly closed: number;
  /**
   * The board and run that just finished, or null before the first one has.
   *
   * Naming the board here is not the leak `current`'s own doc warns against:
   * a completed deal has already had both hands revealed to this player, so
   * there is nothing left to work out about it. What it is for is a scorepad
   * that wants to point at the row it just filled in, rather than making a
   * player hunt for it.
   */
  readonly lastCompleted: DuplicateDeal | null;
  /** True once every deal of the session has been played. */
  readonly complete: boolean;
  /** Deals finished, the one just completed included. Out of `schedule.length`. */
  readonly dealsPlayed: number;
  /**
   * Each seat's running total, in whatever `scoring` this session is playing —
   * every deal played under points, only closed boards under IMPs, since a
   * lone first run has nothing yet to convert.
   *
   * Under points the two readings agree once every board is shut, since a
   * board's margin is the sum of its two runs, and summing the deals is what
   * makes the score move as a session is played. Under IMPs there is only the
   * one reading: `impsFor` needs a board's two runs to have anything to
   * convert, so this cannot move any sooner than `closedMarginTotal` does.
   */
  readonly margin: Pair<number>;
  /**
   * How this session's margin and winner are read off its boards — see
   * `DuplicateScoring`'s own doc. Carried the same way `schedule` is: what was
   * actually asked for, not re-derived, since there is nothing about a
   * finished session's shape that could tell points and IMPs apart.
   */
  readonly scoring: DuplicateScoring;
  /**
   * Each seat's real accumulated score — honors, overtricks and undertrick
   * penalties all included, exactly as `scoreDeal` awards them, not the signed
   * net `margin` already is. The two are genuinely different numbers: a deal
   * can pay both seats at once (a made contract for one, honors for the
   * other), so this is not `[x, -x]` the way `margin` always is. Summed the
   * same way `margin` is, from `DuplicateDealScore.points` rather than from
   * `DuplicateResult.points`, which has already collapsed a run to its net.
   */
  readonly points: Pair<number>;
  /**
   * Which order this session was dealt in — see `scheduleKindOf`, which this is.
   * Naming the *kind* is not naming the board, so it says nothing `current`'s
   * own doc comment does not already allow: a player can be told the session is
   * "Halves" without being told which board is on the table.
   */
  readonly schedule: DuplicateSchedule;
  /** The current deal's duplicate score, once it is complete and was not passed out. */
  readonly score: DuplicateDealScore | null;
  /** Vulnerability as it stood for the deal in progress or just finished. */
  readonly vulnerable: Pair<boolean>;
  readonly winner: PlayerId | null;
}

export function summarizeDuplicate(session: DuplicateState): DuplicateSummary {
  const vulnerable = currentVulnerable(session);
  const score = duplicateScoreFor(session.deal, vulnerable);
  // Whether the deal on the table has already been written into `results`.
  //
  // `results[i]` describes `schedule[i]` and the deal on the table is
  // `schedule[at]`, so the invariant is exactly this comparison. It matters only at
  // the end of a session, where a rubber has no equivalent state to be in: dealing
  // always hands a rubber a *fresh* deal, while the last deal of a schedule is
  // committed and then left on the table, since something has to be on screen
  // behind the final score. Without this that deal was folded in twice — the last
  // board grew a third run and the session margin was wrong.
  const committed = session.results.length > session.at;
  const results =
    session.deal.phase === "complete" && !committed
      ? [...session.results, resultFor(session)]
      : session.results;

  const boards: BoardOutcome[] = session.boards.map((board, index) => {
    const played = results.filter((result) => result.board === index);
    const first = played.find((result) => !result.replay);
    const replay = played.find((result) => result.replay);
    return {
      board: index,
      margin:
        first === undefined || replay === undefined ? null : first.points - replay.points,
      played,
      starter: board.starter,
    };
  });

  const scoring = session.scoring ?? "points";

  // **Every deal played, not every board closed — under points.**
  //
  // These come to the same total in the end — a board's margin is the sum of its
  // two runs read from one seat, so summing the runs and summing the boards agree
  // once every board is shut. The difference is what happens in between: totalling
  // closed boards only, the score sat at nil until a board came round again, which
  // on a short session meant most of it. A running score that does not run is a
  // figure nobody can use.
  //
  // It is also the honest reading of what a session *is*: one signed score a deal
  // and the total is their sum. The board pairing is how a deal gets its meaning,
  // not an extra step the arithmetic has to wait for.
  //
  // **Under IMPs there is no equivalent running reading, so this sums closed
  // boards only** — see `closedMargin`, shared with `closedMarginTotal` for
  // exactly that reason: the two must never disagree about what a closed
  // board is worth.
  const toSeatZero =
    scoring === "imps"
      ? closedMargin(boards, scoring, 0)
      : boards.reduce(
          (total, outcome) =>
            total + outcome.played.reduce((sum, run) => sum + netTo(outcome, run, 0), 0),
          0,
        );
  // Folded over every run directly rather than through `boards`, since a board
  // pairing is what a *margin* needs — two runs to subtract — and a real score
  // has nothing to pair against: each run stands on its own.
  const points: Pair<number> = results.reduce<Pair<number>>(
    (totals, run) => [totals[0] + rawScoreTo(run, 0), totals[1] + rawScoreTo(run, 1)],
    [0, 0],
  );
  const complete = results.length === session.schedule.length;

  return {
    boards,
    current: complete ? null : (session.schedule[session.at] ?? null),
    closed: boards.filter((outcome) => outcome.margin !== null).length,
    complete,
    dealsPlayed: results.length,
    lastCompleted: results.length === 0 ? null : (session.schedule[results.length - 1] ?? null),
    margin: [toSeatZero, 0 - toSeatZero],
    points,
    schedule: session.scheduleKind ?? scheduleKindOf(session),
    score,
    scoring,
    vulnerable,
    // Only once every board is in. A session led at the halfway point has no
    // closed boards at all, so an interim winner would be a claim about nothing.
    winner: !complete || toSeatZero === 0 ? null : toSeatZero > 0 ? 0 : 1,
  };
}

function subtotalBy(
  summary: DuplicateSummary,
  seat: PlayerId,
  pick: (outcome: BoardOutcome) => DuplicateResult | null,
): number | null {
  let total = 0;
  let any = false;
  for (const board of summary.boards) {
    const run = pick(board);
    if (run !== null) {
      total += netTo(board, run, seat);
      any = true;
    }
  }
  return any ? total : null;
}

/** This seat's net across every board's first play so far, or null before any exist. */
export function firstPlayTotal(summary: DuplicateSummary, seat: PlayerId): number | null {
  return subtotalBy(summary, seat, firstPlayOf);
}

/** This seat's net across every board's replay so far, or null before any exist. */
export function replayTotal(summary: DuplicateSummary, seat: PlayerId): number | null {
  return subtotalBy(summary, seat, replayOf);
}

/**
 * A seat's closed boards, converted through whatever `scoring` asks for and
 * summed — shared between `summarizeDuplicate`'s own IMPs reading and
 * `closedMarginTotal`, so the two can never disagree about what a closed
 * board is worth. An open board (`margin === null`) contributes nothing,
 * which is what makes this the same computation either way: points has
 * nothing to convert, IMPs has nothing yet to compare.
 */
function closedMargin(
  boards: readonly BoardOutcome[],
  scoring: DuplicateScoring,
  seat: PlayerId,
): number {
  return boards.reduce((total, board) => {
    if (board.margin === null) {
      return total;
    }
    const raw = marginTo(board, seat);
    return total + (scoring === "imps" ? impsFor(raw) : raw);
  }, 0);
}

/**
 * This seat's net summed across only the boards that have closed — both runs
 * played — or null before any have. In whatever `scoring` the session is
 * playing, the same as `DuplicateSummary.margin` is.
 *
 * Distinct from `margin` under points, which runs on every deal played so the
 * score moves as the session goes rather than sitting at nil until a board
 * comes round again — this is the other reading: what the boards that have
 * actually cancelled their own luck say, ignoring whichever board is only
 * half played. Under IMPs the two are never distinct: `margin` already sums
 * closed boards only, since a lone first run has nothing yet to convert, so
 * this and `margin` agree exactly and at every point in the session.
 */
export function closedMarginTotal(summary: DuplicateSummary, seat: PlayerId): number | null {
  return summary.closed === 0 ? null : closedMargin(summary.boards, summary.scoring, seat);
}

/**
 * Deals the next board of the schedule, committing the finished deal.
 *
 * No seed argument, unlike `nextDeal`: a session's deals are its boards and they
 * were chosen when it started. That is the point of a board being a number.
 *
 * A deal passed out is **not** redealt. In a rubber it must be, since nothing was
 * scored and the standing has not moved; here a passed-out board is a result — it
 * says nobody found a contract worth bidding, and the other run's score is then
 * the whole margin, which is the sharpest thing a board can say. Redealing it
 * would replace that with a different stock and there would be nothing to
 * compare.
 */
export function nextDuplicateDeal(session: DuplicateState): DuplicateState {
  // Dealt past the end, which the app really does do: the deal-complete screen
  // offers a fresh session once one is over and is wired to the same call. Without
  // this it appended the last result a second time — `results` grew past the
  // schedule, the last board acquired a third run, and the margin quietly changed
  // while `complete` stayed true. Starting a *new* session is the caller's
  // business, since it needs board numbers and a seed the engine cannot invent.
  if (session.results.length >= session.schedule.length) {
    return session;
  }

  const next = session.at + 1;
  const entry = session.schedule[next];
  const results = [...session.results, resultFor(session)];

  if (entry === undefined) {
    // The last deal of the schedule. It stays on the table, since something has to
    // be on screen behind the final score, and `at` no longer indexes anything —
    // `summarizeDuplicate` reports `complete` from the result count.
    return { ...session, results };
  }

  const board = session.boards[entry.board]!;
  return {
    at: next,
    boards: session.boards,
    deal: startDeal({ seed: board.seed, starter: starterFor(board, entry.replay) }),
    results,
    schedule: session.schedule,
    ...(session.scheduleKind === undefined ? {} : { scheduleKind: session.scheduleKind }),
    ...(session.scoring === undefined ? {} : { scoring: session.scoring }),
  };
}

/**
 * International Match Points, from a point difference.
 *
 * **A setting now — `DuplicateScoring` — and not the argument-by-measurement
 * exercise this was written for.** The case for points stands: everybody
 * understands them, every other screen speaks them, and duplication has
 * already cancelled the deal, so a duplicate margin is far better behaved
 * than a rubber margin to begin with. The case *for offering the choice* is
 * different and narrower — a session with one or two boards that reach a
 * slam or a doubled game can have those boards decide it on points alone,
 * with the rest of the session barely moving the total; IMPs' whole job is
 * to stop one board outweighing the others like that.
 *
 * The earlier objection to a setting was that a session could be won on
 * points and lost on IMPs, costing two rating pools and two things for the
 * bidder to maximise. The first cost does not bind: duplicate sessions are
 * not rated at all — see `ratings.ts`'s own reasoning, which has nothing to
 * do with the scale. **The second is real and left open rather than fixed**:
 * `bidValue.ts`'s duplicate objective prices every call in points regardless
 * of which scale the session settles in, so a bot bidding under IMPs is not
 * bidding for what actually decides the match it is playing. Chosen once, at
 * the session's own start, the same way `DuplicateSchedule` is — a session
 * still records both runs' raw scores regardless, so nothing about *how it
 * was played* depends on the choice, only how the boards are read afterwards.
 */
const IMP_STEPS: readonly number[] = [
  20, 50, 90, 130, 170, 220, 270, 320, 370, 430, 500, 600, 750, 900, 1100, 1300, 1500, 1750, 2000,
  2250, 2500, 3000, 3500, 4000,
];

export function impsFor(difference: number): number {
  const size = Math.abs(difference);
  let imps = 0;
  while (imps < IMP_STEPS.length && size >= IMP_STEPS[imps]!) {
    imps += 1;
  }
  return difference < 0 ? -imps : imps;
}
