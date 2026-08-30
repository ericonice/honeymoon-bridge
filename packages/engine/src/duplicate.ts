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
 * Three genuinely different games rather than three cosmetic orderings, because what
 * changes is how much of a board you can still remember when it comes round:
 *
 *  - `adjacent` plays a board's two runs back to back. The comparison is immediate
 *    and recall is complete, so the board turns purely on what each side did with the
 *    same stock — the clearest statement of what duplicate *is*, and no test of
 *    memory at all.
 *  - `halves` plays every board once, then replays them in a random order with a
 *    floor on how soon one may come back. Memory matters most here, and working out
 *    which board you are on is part of it.
 *  - `random` shuffles the lot. A board's replay may land anywhere after its first
 *    run, immediately included — no floor, because being completely random is the
 *    point of asking for it.
 */
export type DuplicateSchedule = "adjacent" | "halves" | "random";

/**
 * The order a session's deals are played in.
 *
 * `minGap` applies to `halves` alone. Under `adjacent` a board comes back at once by
 * definition, and under `random` a floor is the thing that would stop it being
 * random — so in neither case is there anything for it to constrain.
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
  const schedule = scheduleFor(
    count,
    options.scheduleSeed,
    options.minGap ?? minGapFor(count),
    options.schedule ?? "halves",
  );
  const opening = schedule[0]!;
  const board = boards[opening.board]!;

  return {
    at: 0,
    boards,
    deal: startDeal({ seed: board.seed, starter: starterFor(board, opening.replay) }),
    results: [],
    schedule,
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
  /** True once every deal of the session has been played. */
  readonly complete: boolean;
  /** Deals finished, the one just completed included. Out of `schedule.length`. */
  readonly dealsPlayed: number;
  /**
   * Each seat's running total: every deal played, not every board closed.
   *
   * The two agree once every board is shut, since a board's margin is the sum of its
   * two runs. Summing the deals is what makes the score move as a session is played.
   */
  readonly margin: Pair<number>;
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

  // **Every deal played, not every board closed.**
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
  const toSeatZero = boards.reduce(
    (total, outcome) =>
      total + outcome.played.reduce((sum, run) => sum + netTo(outcome, run, 0), 0),
    0,
  );
  const complete = results.length === session.schedule.length;

  return {
    boards,
    current: complete ? null : (session.schedule[session.at] ?? null),
    closed: boards.filter((outcome) => outcome.margin !== null).length,
    complete,
    dealsPlayed: results.length,
    margin: [toSeatZero, 0 - toSeatZero],
    score,
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
  };
}

/**
 * International Match Points, from a point difference.
 *
 * **Unused, deliberately.** A session is scored in points: everybody understands
 * them, every other screen speaks them, and `bidValue.ts` already prices in them.
 * IMPs was the first proposal, on the grounds that a concave scale stops one
 * doubled disaster deciding a session — and what weakened it is that duplication
 * has already cancelled the deal, so a duplicate margin is far better behaved
 * than a rubber margin to begin with.
 *
 * It is written anyway because it is the only way to settle that by measurement
 * rather than by argument: a session records its board seeds, its schedule seed
 * and both runs' scores, so any played session can be re-scored the other way
 * afterwards and the two answers compared. If it rarely changes who won, IMPs is
 * an explanation nobody needed.
 *
 * Note it cannot become a *setting*: a session can be won on points and lost on
 * IMPs, so the two are different formats — two rating pools, and two things for
 * the bidder to maximise, since a concave objective sacrifices and doubles less
 * than a linear one.
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
