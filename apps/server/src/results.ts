import type { MatchFormat, PlayerId } from "@hb/engine";
import type { Env } from "./env.js";

/**
 * The token standing in for the computer.
 *
 * Not a device and not an account. Deliberately not a UUID, so it cannot collide
 * with a real `playerToken`, and recognisable on sight in the table.
 */
export const ROBOT_TOKEN = "@robot";

/** One seat's side of a finished rubber, as the table knew it. */
export interface FinishedSeat {
  readonly accountId: string | null;
  readonly nickname: string;
  readonly points: number;
  readonly token: string;
}

export interface FinishedRubber {
  readonly code: string;
  readonly deals: number;
  readonly format: MatchFormat;
  readonly seats: readonly [FinishedSeat, FinishedSeat];
  readonly winner: PlayerId;
}

/**
 * Writes a finished rubber down.
 *
 * Recorded even when neither player was signed in. A token can be claimed by an
 * account afterwards, and the row is what makes that claim worth anything — a
 * rubber discarded for want of an account at the time could never be recovered.
 */
export async function recordRubber(env: Env, rubber: FinishedRubber, now: number): Promise<void> {
  const [first, second] = rubber.seats;
  await env.DB.prepare(
    `INSERT INTO results
       (id, finished_at, table_code, winner, deals, format,
        account0, token0, nickname0, points0,
        account1, token1, nickname1, points1)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      now,
      rubber.code,
      rubber.winner,
      rubber.deals,
      rubber.format,
      first.accountId,
      first.token,
      first.nickname,
      first.points,
      second.accountId,
      second.token,
      second.nickname,
      second.points,
    )
    .run();
}

/**
 * Forgets this account's record.
 *
 * Two different operations, because a row is not always this person's to
 * delete. A rubber against the computer involves nobody else and goes. A rubber
 * against a *person* is one row holding both sides of a game they also played,
 * and deleting it would reach into their record and remove a match they won —
 * so their side is left exactly as it is and only this side is detached.
 *
 * Detaching means clearing the account and replacing the device token with one
 * that maps to nothing, since the token is the other way a row is recognised.
 * What the opponent keeps is a game against somebody with the name that was
 * used at the time, which is the truth of what happened.
 */
export async function resetRecord(env: Env, accountId: string): Promise<number> {
  const mine = "(account{seat} = ?1 OR token{seat} IN (SELECT token FROM account_tokens WHERE account_id = ?1))";
  const asSeat = (seat: 0 | 1): string => mine.replaceAll("{seat}", String(seat));

  const removed = await env.DB.prepare(
    `DELETE FROM results WHERE token1 = ?2 AND ${asSeat(0)}`,
  )
    .bind(accountId, ROBOT_TOKEN)
    .run();

  let detached = 0;
  for (const seat of [0, 1] as const) {
    const other = seat === 0 ? 1 : 0;
    const result = await env.DB.prepare(
      `UPDATE results SET account${seat} = NULL, token${seat} = ?3
       WHERE token${other} != ?2 AND ${asSeat(seat)}`,
    )
      // A value nothing maps to, so the row can never be recognised as this
      // person's again — including by an account that later claims the device
      // token this replaces.
      .bind(accountId, ROBOT_TOKEN, `forgotten:${crypto.randomUUID()}`)
      .run();
    detached += result.meta.changes;
  }

  return removed.meta.changes + detached;
}

interface ResultRow {
  readonly account0: string | null;
  readonly account1: string | null;
  readonly deals: number;
  readonly finished_at: number;
  readonly format: MatchFormat;
  readonly nickname0: string;
  readonly nickname1: string;
  readonly points0: number;
  readonly points1: number;
  readonly token0: string;
  readonly token1: string;
  readonly winner: number;
}

/**
 * A record against one opponent at one match length, from the asker's side.
 *
 * One per opponent *per format*: a rubber and a game are not the same
 * achievement, and a combined tally would be one number meaning two things.
 */
export interface OpponentRecord {
  /** Deals across all of these matches, which is how long the sittings ran. */
  readonly deals: number;
  readonly format: MatchFormat;
  readonly lastPlayed: number;
  readonly lost: number;
  /**
   * What to call them.
   *
   * The account's name where there is an account, which since §3.7 is every
   * match against a person played from now on. This screen used to show an
   * *email address* here, for want of anything else to print — the one place in
   * the app where one player was shown another's personal data, and it was
   * never a decision so much as a gap.
   */
  readonly name: string;
  readonly pointsAgainst: number;
  readonly pointsFor: number;
  readonly won: number;
}

export interface Records {
  readonly opponents: OpponentRecord[];
  /** Kept apart from the rest — see `recordsFor`. One entry per format played. */
  readonly robot: OpponentRecord[];
}

type Tallied = OpponentRecord & { readonly account: string | null; readonly token: string };

/**
 * Everyone this account has finished a rubber against.
 *
 * Aggregated here rather than in SQL. A person is two different columns
 * depending on which seat they took, and both of them resolve through a second
 * table, which turns a plain grouping into something long enough to be worth
 * getting wrong. The volume this will ever see is a family's worth of card
 * games, so the readable version is also the right one.
 *
 * The computer is reported separately rather than listed among the opponents,
 * and not only because it reads better. A networked rubber is witnessed by the
 * server, which owned the state and applied every rule; a rubber against the
 * computer happened entirely in a browser and is taken on that browser's word.
 * They are not the same kind of fact and should not be added together.
 */
export async function recordsFor(env: Env, accountId: string): Promise<Records> {
  const tokens = await env.DB.prepare("SELECT token FROM account_tokens WHERE account_id = ?")
    .bind(accountId)
    .all<{ token: string }>();
  const mine = new Set(tokens.results.map((row) => row.token));

  const rows = await env.DB.prepare(
    `SELECT * FROM results
     WHERE account0 = ?1 OR account1 = ?1 OR token0 IN (
       SELECT token FROM account_tokens WHERE account_id = ?1
     ) OR token1 IN (
       SELECT token FROM account_tokens WHERE account_id = ?1
     )
     ORDER BY finished_at`,
  )
    .bind(accountId)
    .all<ResultRow>();

  const isMine = (account: string | null, token: string): boolean =>
    account === accountId || (account === null && mine.has(token));

  const tally = new Map<string, Tallied>();

  for (const row of rows.results) {
    // Which seat was this account? Seat 0 unless only seat 1 matches.
    const seat: PlayerId = isMine(row.account0, row.token0) ? 0 : 1;
    const them = seat === 0 ? 1 : 0;

    const theirAccount = them === 0 ? row.account0 : row.account1;
    const theirToken = them === 0 ? row.token0 : row.token1;
    const theirName = them === 0 ? row.nickname0 : row.nickname1;
    const myPoints = seat === 0 ? row.points0 : row.points1;
    const theirPoints = them === 0 ? row.points0 : row.points1;

    // Grouped by account where there is one, and otherwise by the device. Two
    // anonymous opponents are two different people; the same one twice is one.
    // Split by format as well, so a rubber record and a game record stay apart.
    const key = `${theirAccount ?? `token:${theirToken}`}|${row.format}`;
    const running = tally.get(key);
    const won = row.winner === seat;

    tally.set(key, {
      account: theirAccount,
      deals: (running?.deals ?? 0) + row.deals,
      format: row.format,
      lastPlayed: row.finished_at,
      lost: (running?.lost ?? 0) + (won ? 0 : 1),
      // The most recent one stored on the row. For an opponent with an account
      // this is overwritten below by the name they go by now; it survives only
      // for rows played before an account was required, where it is all there
      // is.
      name: theirName,
      pointsAgainst: (running?.pointsAgainst ?? 0) + theirPoints,
      pointsFor: (running?.pointsFor ?? 0) + myPoints,
      token: theirToken,
      won: (running?.won ?? 0) + (won ? 1 : 0),
    });
  }

  const all = [...tally.values()];

  return {
    opponents: await withNames(
      env,
      all.filter((entry) => entry.token !== ROBOT_TOKEN),
    ),
    robot: all
      .filter((entry) => entry.token === ROBOT_TOKEN)
      .map(strip)
      .sort((a, b) => b.lastPlayed - a.lastPlayed),
  };
}

function strip({ account: _account, token: _token, ...record }: Tallied): OpponentRecord {
  return record;
}

/**
 * Replaces the name stored on each row with the one that account goes by now,
 * in one query.
 *
 * A name can change and a record is read long after the game, so the current
 * one is what a person expects to see. Rows with no account keep what was
 * stored: those were played before an account was required and there is nothing
 * to look up. Doing it the other way — the stored name always — would leave a
 * screen where a renamed opponent appears under both names at once.
 */
async function withNames(env: Env, records: readonly Tallied[]): Promise<OpponentRecord[]> {
  const ids = [...new Set(records.flatMap((r) => (r.account === null ? [] : [r.account])))];
  const names = new Map<string, string>();

  if (ids.length > 0) {
    const rows = await env.DB.prepare(
      `SELECT id, name FROM accounts WHERE id IN (${ids.map(() => "?").join(",")})`,
    )
      .bind(...ids)
      .all<{ id: string; name: string | null }>();
    for (const row of rows.results) {
      if (row.name !== null) {
        names.set(row.id, row.name);
      }
    }
  }

  return records
    .map((record) => ({
      ...strip(record),
      name: (record.account === null ? null : names.get(record.account)) ?? record.name,
    }))
    .sort((a, b) => b.lastPlayed - a.lastPlayed);
}
