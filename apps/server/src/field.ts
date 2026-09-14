import type { Contract, Pair, PlayerId } from "@hb/engine";
import type { Env } from "./env.js";

/**
 * The corpus a field session is played against — §1.8a.
 *
 * Two things happen here and the separation between them is the format's central
 * rule rather than an implementation detail. **Boards go out without their
 * history**, because a board's recorded results name the contract and say how it
 * went, which is the largest hint anybody could be handed about a deal they are
 * about to bid. **The history comes back only to somebody who has already played
 * the board**, and that is checked here rather than trusted to the client: a rule
 * enforced at one end and assumed at the other is a rule with a hole in it.
 */

/** One board as a client is allowed to see it before playing: a stock and its terms. */
export interface FieldBoardRow {
  readonly id: string;
  readonly seed: number;
  readonly starter: PlayerId;
  readonly vulnerable: Pair<boolean>;
}

/** One recorded result, as a traveller draws it. */
export interface FieldEntryRow {
  readonly contract: Contract | null;
  /**
   * Who played whom — §1.8a. Three kinds sit on a board and they are not the same
   * evidence: a score made across the table from a person was shaped by that person,
   * where a solo one was made against the opposition everybody else faced.
   *
   * Derived rather than stored, because it already is: a generated row has no
   * account, and a table result is one recorded with an opponent. The day a fourth
   * pairing becomes legal is the day it earns a column.
   */
  readonly kind: "computer" | "solo" | "table";
  readonly points: number;
  readonly tricks: Pair<number> | null;
  readonly who: string;
}

/** A result being recorded, whether the computer's own or a person's. */
export interface FieldResultReport {
  readonly boardId: string;
  readonly contract: Contract | null;
  /**
   * The account that sat opposite, for a board played at a table. Absent for solo
   * play, which is what makes the two distinguishable — see `0014_field_opponent`.
   */
  readonly opponentAccountId?: string;
  readonly points: number;
  readonly tricks: Pair<number>;
}

/**
 * Boards to play: ones this account has not met, deepest history first.
 *
 * **Both halves of that ordering are load-bearing and they pull opposite ways.**
 * Always meeting a fresh board is what keeps the format a test of play rather than
 * of memory. But if everybody always met a board nobody had touched, every board
 * would carry exactly one result forever and the field would never arrive. So: new
 * to you, not new to everybody — boards fill up one player at a time.
 *
 * "Not met" is by **seed**, not by board. The two streams of one stock are separate
 * boards, and every deal is played to thirteen tricks with both hands face up at the
 * end, so meeting the other side of a stock you have played is meeting it knowing
 * everything.
 *
 * Fewer rows than asked for is a real answer rather than an error: it means this
 * player has played most of the corpus, and the caller decides whether that is a
 * short session or a reason to generate more.
 */
export async function fieldBoardsFor(
  env: Env,
  accountId: string,
  count: number,
): Promise<readonly FieldBoardRow[]> {
  const { results } = await env.DB.prepare(
    // **One board per seed, which is not the same rule as excluding seeds already
    // played.** A stock's two streams are separate boards, and the exclusion below
    // only knows about boards played in *earlier* sessions — so without the
    // partition a single fetch will happily hand somebody both ends of the same
    // stock, and the second is played knowing every card. Found by probing the
    // route rather than by reading it.
    //
    // Within a seed the **shallower** stream wins, so the two sides fill evenly.
    // Taking the deeper one instead starves the other permanently: whoever meets the
    // seed plays the deep side, which excludes the seed from them entirely, and the
    // next player faces the same choice and makes the same one.
    //
    // **Ordered by how many *people* have played it, then by when it was made.**
    // A plain entry count cannot do the first job and looked as though it could: a
    // board opens with eight machine runs, and a person joining retires one — so the
    // count is eight before and eight after, and an ordering on it concentrates
    // nothing. Counting the human rows is the question actually being asked.
    //
    // The second key is what makes a pool build a library rather than spread thin.
    // With nobody having played anything, every board ties on the first key and the
    // order is the board's own number — so a single player works through the pool
    // from the front, and the boards behind them are the ones the next player is
    // offered first.
    //
    // The number rather than `created_at`, which was a timestamp being asked to mean
    // a sequence and only worked because the generator stamped its rows a millisecond
    // apart. `id` still breaks a tie, since a board with no number at all must still
    // come out somewhere rather than sorting unpredictably.
    `SELECT id, seed, starter, vulnerable_0, vulnerable_1
       FROM (
         SELECT b.id, b.seed, b.starter, b.vulnerable_0, b.vulnerable_1, b.number,
                COUNT(r.id) AS entries,
                SUM(CASE WHEN r.generated = 0 THEN 1 ELSE 0 END) AS people,
                ROW_NUMBER() OVER (
                  PARTITION BY b.seed ORDER BY COUNT(r.id) ASC, b.starter ASC
                ) AS side
           FROM field_boards b
           LEFT JOIN field_results r ON r.board_id = b.id
          WHERE b.seed NOT IN (
                  SELECT played.seed
                    FROM field_results mine
                    JOIN field_boards played ON played.id = mine.board_id
                   WHERE mine.account_id = ?
                )
          GROUP BY b.id
       )
      WHERE side = 1
      ORDER BY people DESC, number ASC, id ASC
      LIMIT ?`,
  )
    .bind(accountId, count)
    .all<BoardColumns>();

  const fresh = results.map(asBoard);
  if (fresh.length >= count) {
    return fresh;
  }
  // **Nothing new left, so the twins come out** — §1.8a. A session that is silently
  // short reads as the length setting being ignored, and the other side of a stock is
  // a better answer than no board at all: recognising a board from thirteen
  // unlabelled cards played some time ago is hard enough that the head start is
  // mostly theoretical. What it is not is nothing, which is why the result it
  // produces is kept out of the field — see `replayedFor`.
  const twins = await twinBoardsFor(env, accountId, count - fresh.length);
  return [...fresh, ...twins];
}

/**
 * The other side of a stock this account has played, for topping a session up.
 *
 * Excluded by **board** rather than by seed, which is the whole difference from the
 * query above: the seed is one this player has met, and what is being looked for is
 * the side of it they have not.
 */
async function twinBoardsFor(
  env: Env,
  accountId: string,
  count: number,
): Promise<readonly FieldBoardRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT b.id, b.seed, b.starter, b.vulnerable_0, b.vulnerable_1
       FROM field_boards b
      WHERE b.seed IN (
              SELECT played.seed
                FROM field_results mine
                JOIN field_boards played ON played.id = mine.board_id
               WHERE mine.account_id = ?
            )
        AND b.id NOT IN (SELECT board_id FROM field_results WHERE account_id = ?)
      ORDER BY b.number ASC, b.id ASC
      LIMIT ?`,
  )
    .bind(accountId, accountId, count)
    .all<BoardColumns>();
  return results.map(asBoard);
}

interface BoardColumns {
  readonly id: string;
  readonly seed: number;
  readonly starter: number;
  readonly vulnerable_0: number;
  readonly vulnerable_1: number;
}

function asBoard(row: BoardColumns): FieldBoardRow {
  return {
    id: row.id,
    seed: row.seed,
    starter: (row.starter === 1 ? 1 : 0) as PlayerId,
    vulnerable: [row.vulnerable_0 === 1, row.vulnerable_1 === 1],
  };
}

/**
 * Records what somebody made of a board.
 *
 * **Only a player's first encounter with a board counts**, so a second result from
 * the same account on the same board is dropped rather than stored. Playing a board
 * again is allowed — §1.8a — but a second visit is played knowing the cards and is
 * not evidence about anything. Dropped silently and reported as accepted, because
 * the alternative is a client retrying forever: `outbox.ts` treats a 4xx as
 * permanent, but a duplicate is not a malformed body and should not read like one.
 */
export async function recordFieldResult(
  env: Env,
  report: FieldResultReport,
  accountId: string,
  now: number,
): Promise<void> {
  const already = await env.DB.prepare(
    `SELECT 1 FROM field_results WHERE board_id = ? AND account_id = ? LIMIT 1`,
  )
    .bind(report.boardId, accountId)
    .first();
  if (already !== null) {
    return;
  }
  // Worked out here rather than reported: it is simply whether this account already
  // has a result on the same stock, which the server can see and a client has no
  // business asserting.
  const replayed = await replayedFor(env, report.boardId, accountId);
  await insertFieldResult(env, report, accountId, false, now, replayed);
  // **A replayed board does not retire a machine run.** The scaffolding is displaced
  // by results that join the field, and this one does not.
  if (!replayed) {
    await retireGeneratedRow(env, report.boardId);
  }
}

/** Whether this account has already played the other side of this board's stock. */
async function replayedFor(env: Env, boardId: string, accountId: string): Promise<boolean> {
  const found = await env.DB.prepare(
    `SELECT 1
       FROM field_results mine
       JOIN field_boards played ON played.id = mine.board_id
      WHERE mine.account_id = ?
        AND played.seed = (SELECT seed FROM field_boards WHERE id = ?)
      LIMIT 1`,
  )
    .bind(accountId, boardId)
    .first();
  return found !== null;
}

/**
 * Drops one generated run when a person's result joins a board — §1.8a.
 *
 * The scaffolding is there to make a board playable before anybody has met it, not to
 * stay, so a field fills up with people one result at a time.
 *
 * **The oldest, and that is unbiased rather than arbitrary.** Choosing which machine
 * run to drop looks like it needs care — drop the median and the field widens, drop an
 * extreme and it narrows — but the generated runs are *exchangeable by construction*:
 * they differ only in a derived seed and nothing distinguishes them. So "oldest" is
 * exactly as unbiased as a coin flip and is deterministic where a coin flip is not.
 *
 * Once they are gone nothing is retired. People are not dropped to preserve a shape
 * that existed for the machine's benefit, and matchpoints handle any field size.
 */
async function retireGeneratedRow(env: Env, boardId: string): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM field_results
      WHERE id = (SELECT id FROM field_results
                   WHERE board_id = ? AND generated = 1
                   ORDER BY played_at ASC, id ASC
                   LIMIT 1)`,
  )
    .bind(boardId)
    .run();
}

/** The computer's own entry, written when a board is generated rather than played. */
export async function recordGeneratedResult(
  env: Env,
  report: FieldResultReport,
  now: number,
): Promise<void> {
  await insertFieldResult(env, report, null, true, now, false);
}

async function insertFieldResult(
  env: Env,
  report: FieldResultReport,
  accountId: string | null,
  generated: boolean,
  now: number,
  replayed: boolean,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO field_results
       (id, board_id, played_at, account_id, opponent_account_id, generated, replayed,
        points, declarer, contract_level, contract_strain, contract_doubling,
        tricks_0, tricks_1)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      report.boardId,
      now,
      accountId,
      report.opponentAccountId ?? null,
      generated ? 1 : 0,
      replayed ? 1 : 0,
      Math.round(report.points),
      report.contract?.declarer ?? null,
      report.contract?.level ?? null,
      report.contract?.strain ?? null,
      report.contract?.doubling ?? null,
      report.tricks[0],
      report.tricks[1],
    )
    .run();
}

/**
 * Every other recorded result on a board, for somebody who has earned the right.
 *
 * Null when the asker has no result of their own here, which is §1.8a's rule rather
 * than an authorization check: the field names the contract and says how it went, so
 * handing it over first would be handing over the answer.
 *
 * **The asker's own result is left out**, because a ranking against a field you are
 * yourself part of pulls toward you — on a two-entry board it would hand you a free
 * tie with yourself.
 *
 * The rows come back whole rather than averaged. §1.8a shows a contract and a result
 * beside every score, so an entry has to be a real deal somebody played; a mean has
 * no contract, and inventing one for it would put a figure on screen that nothing
 * played.
 */
export async function fieldFor(
  env: Env,
  boardId: string,
  accountId: string,
): Promise<readonly FieldEntryRow[] | null> {
  const mine = await env.DB.prepare(
    `SELECT 1 FROM field_results WHERE board_id = ? AND account_id = ? LIMIT 1`,
  )
    .bind(boardId, accountId)
    .first();
  if (mine === null) {
    return null;
  }

  const { results } = await env.DB.prepare(
    `SELECT r.points, r.generated, r.opponent_account_id, r.declarer,
            r.contract_level, r.contract_strain, r.contract_doubling,
            r.tricks_0, r.tricks_1, a.name AS who
       FROM field_results r
       LEFT JOIN accounts a ON a.id = r.account_id
      WHERE r.board_id = ?
        AND (r.account_id IS NULL OR r.account_id != ?)
        AND coalesce(r.replayed, 0) = 0
      ORDER BY r.played_at ASC`,
  )
    .bind(boardId, accountId)
    .all<{
      readonly points: number;
      readonly generated: number;
      readonly opponent_account_id: string | null;
      readonly declarer: number | null;
      readonly contract_level: number | null;
      readonly contract_strain: string | null;
      readonly contract_doubling: string | null;
      readonly tricks_0: number;
      readonly tricks_1: number;
      readonly who: string | null;
    }>();

  return results.map((row) => ({
    contract:
      row.contract_level === null || row.contract_strain === null || row.declarer === null
        ? null
        : {
            declarer: (row.declarer === 1 ? 1 : 0) as PlayerId,
            doubling: (row.contract_doubling ?? "none") as Contract["doubling"],
            level: row.contract_level as Contract["level"],
            strain: row.contract_strain as Contract["strain"],
          },
    kind: row.generated === 1 ? "computer" : row.opponent_account_id === null ? "solo" : "table",
    points: row.points,
    tricks: [row.tricks_0, row.tricks_1],
    // A person with no name yet is "a player" rather than a blank: the row is real
    // and the traveller has to be able to draw it.
    who: row.generated === 1 ? "Computer" : (row.who ?? "A player"),
  }));
}

/**
 * Reads a reported result, or null for anything that is not one.
 *
 * Bounded and typed on the way in and verified against nothing, exactly like every
 * other client report here — no server watched this deal. What it will not do is
 * accept a *partial* one: a board with no score is not a shorter report but a
 * different thing, and it would enter the corpus as a figure somebody is later
 * measured against.
 */
export function fieldResultFrom(body: unknown): FieldResultReport | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const one = body as Record<string, unknown>;
  const tricks = one.tricks;
  if (
    typeof one.boardId !== "string" ||
    one.boardId.length === 0 ||
    typeof one.points !== "number" ||
    !Number.isFinite(one.points) ||
    !Array.isArray(tricks) ||
    tricks.length !== 2 ||
    !tricks.every((count) => typeof count === "number" && Number.isFinite(count))
  ) {
    return null;
  }
  const contract = contractFrom(one.contract);
  // Undefined means the contract was there and was malformed; null means the deal
  // was passed out, which is a real result. Telling those apart is the whole reason
  // this is not a plain `?? null`.
  if (contract === undefined) {
    return null;
  }
  return {
    boardId: one.boardId,
    contract,
    points: one.points,
    tricks: [tricks[0] as number, tricks[1] as number],
  };
}

function contractFrom(value: unknown): Contract | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const one = value as Record<string, unknown>;
  const level = one.level;
  const strain = one.strain;
  const declarer = one.declarer;
  const doubling = one.doubling;
  if (
    typeof level !== "number" ||
    level < 1 ||
    level > 7 ||
    typeof strain !== "string" ||
    (declarer !== 0 && declarer !== 1) ||
    (doubling !== "none" && doubling !== "doubled" && doubling !== "redoubled")
  ) {
    return undefined;
  }
  return {
    declarer,
    doubling,
    level: level as Contract["level"],
    strain: strain as Contract["strain"],
  };
}

/** Deletes an account's field results, for the reset that clears everything else. */
export async function scrubFieldResults(env: Env, accountId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM field_results WHERE account_id = ?`).bind(accountId).run();
}

/**
 * Stocks a table can play: those **neither seat has met on either side** — §1.8a.
 *
 * Solo play picks a board and retires its twin for that player. A table cannot: the
 * two seats hold opposite sides of the same stock at the same time, so a seed is only
 * fair here if all four combinations are new — each player against each side.
 *
 * Returned as the pair of boards per seed, in board order, so the table deals seat 0
 * the first-draw side and seat 1 the other. Fewer than asked for means the pool has
 * run out of stocks new to both, which the caller decides what to do about — and the
 * answer is not twins: a twin at a table means one player knows the cards and the
 * other does not, which is worse than a shorter match.
 */
export async function tableBoardsFor(
  env: Env,
  count: number,
  accounts: readonly (string | null)[],
): Promise<readonly FieldBoardRow[]> {
  const ids = accounts.filter((one): one is string => one !== null);
  if (ids.length === 0) {
    return [];
  }
  const holes = ids.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT b.id, b.seed, b.starter, b.vulnerable_0, b.vulnerable_1
       FROM field_boards b
      WHERE b.seed IN (
              SELECT seed FROM field_boards
               WHERE seed NOT IN (
                       SELECT played.seed
                         FROM field_results theirs
                         JOIN field_boards played ON played.id = theirs.board_id
                        WHERE theirs.account_id IN (${holes})
                     )
               GROUP BY seed
               ORDER BY MIN(number) ASC
               LIMIT ?
            )
      ORDER BY b.number ASC, b.starter ASC`,
  )
    .bind(...ids, count)
    .all<BoardColumns>();
  return results.map(asBoard);
}
