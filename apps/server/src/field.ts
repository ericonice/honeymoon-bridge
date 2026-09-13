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

/** What a board's recorded results come to, once the asker is entitled to them. */
export interface FieldReferenceRow {
  readonly contract: Contract | null;
  readonly entries: number;
  readonly points: number;
  readonly tricks: Pair<number> | null;
}

/** A result being recorded, whether the computer's own or a person's. */
export interface FieldResultReport {
  readonly boardId: string;
  readonly contract: Contract | null;
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
    `SELECT b.id, b.seed, b.starter, b.vulnerable_0, b.vulnerable_1,
            COUNT(r.id) AS entries
       FROM field_boards b
       LEFT JOIN field_results r ON r.board_id = b.id
      WHERE b.seed NOT IN (
              SELECT played.seed
                FROM field_results mine
                JOIN field_boards played ON played.id = mine.board_id
               WHERE mine.account_id = ?
            )
      GROUP BY b.id
      ORDER BY entries DESC, b.created_at ASC
      LIMIT ?`,
  )
    .bind(accountId, count)
    .all<{
      readonly id: string;
      readonly seed: number;
      readonly starter: number;
      readonly vulnerable_0: number;
      readonly vulnerable_1: number;
    }>();

  return results.map((row) => ({
    id: row.id,
    seed: row.seed,
    starter: (row.starter === 1 ? 1 : 0) as PlayerId,
    vulnerable: [row.vulnerable_0 === 1, row.vulnerable_1 === 1],
  }));
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
  await insertFieldResult(env, report, accountId, false, now);
}

/** The computer's own entry, written when a board is generated rather than played. */
export async function recordGeneratedResult(
  env: Env,
  report: FieldResultReport,
  now: number,
): Promise<void> {
  await insertFieldResult(env, report, null, true, now);
}

async function insertFieldResult(
  env: Env,
  report: FieldResultReport,
  accountId: string | null,
  generated: boolean,
  now: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO field_results
       (id, board_id, played_at, account_id, generated, points,
        declarer, contract_level, contract_strain, contract_doubling, tricks_0, tricks_1)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      report.boardId,
      now,
      accountId,
      generated ? 1 : 0,
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
 * What a board has been worth, for somebody who has earned the right to know.
 *
 * Null when the asker has no result of their own on this board, which is §1.8a's
 * rule rather than an authorization check: the history says what the contract was
 * and how it went, so handing it over first would be handing over the answer.
 *
 * **The asker's own result is excluded from the average**, which is what a duplicate
 * datum has always done — comparing a score against a figure it is itself part of
 * pulls the yardstick toward whoever is being measured, and on a board with two
 * entries it would halve every margin.
 *
 * The contract shown is **one representative recorded deal**, the earliest, rather
 * than a property of the average. That is deliberate: an average has no contract,
 * and inventing one for it would be a figure nothing played.
 */
export async function fieldReferenceFor(
  env: Env,
  boardId: string,
  accountId: string,
): Promise<FieldReferenceRow | null> {
  const mine = await env.DB.prepare(
    `SELECT 1 FROM field_results WHERE board_id = ? AND account_id = ? LIMIT 1`,
  )
    .bind(boardId, accountId)
    .first();
  if (mine === null) {
    return null;
  }

  const { results } = await env.DB.prepare(
    `SELECT points, declarer, contract_level, contract_strain, contract_doubling,
            tricks_0, tricks_1
       FROM field_results
      WHERE board_id = ? AND (account_id IS NULL OR account_id != ?)
      ORDER BY played_at ASC`,
  )
    .bind(boardId, accountId)
    .all<{
      readonly points: number;
      readonly declarer: number | null;
      readonly contract_level: number | null;
      readonly contract_strain: string | null;
      readonly contract_doubling: string | null;
      readonly tricks_0: number;
      readonly tricks_1: number;
    }>();

  if (results.length === 0) {
    return null;
  }

  const first = results[0]!;
  return {
    contract:
      first.contract_level === null || first.contract_strain === null || first.declarer === null
        ? null
        : {
            declarer: (first.declarer === 1 ? 1 : 0) as PlayerId,
            doubling: (first.contract_doubling ?? "none") as Contract["doubling"],
            level: first.contract_level as Contract["level"],
            strain: first.contract_strain as Contract["strain"],
          },
    entries: results.length,
    // Rounded, because a margin is compared against real scores and a fractional
    // yardstick would put every board a fraction off zero.
    points: Math.round(results.reduce((total, one) => total + one.points, 0) / results.length),
    tricks: [first.tricks_0, first.tricks_1],
  };
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
