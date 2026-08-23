import type { Env } from "./env.js";
import { ROBOT_TOKEN } from "./results.js";

/**
 * What a player is rated, on the Elo scale everybody already half-knows.
 *
 * A rating in a family-sized pool is normally circular: Elo conserves points, so
 * two people who only play each other trade the same points back and forth and the
 * number says nothing the head-to-head record did not. **The computer is what makes
 * it mean something.** Its rating is *pinned* rather than learned, so the pool has
 * an anchor that never moves, and a person's number becomes "how you do against a
 * fixed standard" — which is comparable between two people who have never played
 * each other, and is the one thing a head-to-head table structurally cannot say.
 */

/** Where a person starts. Elo's own nominal average, and what most implementations use. */
export const START_RATING = 1500;

/**
 * How far one result moves a rating.
 *
 * 32 is the usual choice for a pool that plays rarely: high enough that a rubber
 * visibly matters, low enough that one bad night does not erase a season. Arbitrary,
 * like every K.
 */
export const K_FACTOR = 32;

/**
 * What each computer opponent is worth, and the one genuinely invented number here.
 *
 * **The ordering is asserted, not measured, and the recorded games cannot settle
 * it.** Against v1 this account is 6–2 and against v2 it is 21–2, which taken at
 * face value makes v2 the *weaker* opponent — but the same period is when the person
 * got better, and with one human there is nothing to separate their improvement from
 * the bot's. `bench/rubber.ts` cannot re-measure it either: a version is a snapshot
 * of code, and v1's is gone.
 *
 * So the spacing comes from what was measured at the time the change landed: the
 * bidder that became v2 beat its predecessor 775 rubbers to 225 over a thousand,
 * which is a 77.5% score and therefore about a 215-point gap. Two hundred is that,
 * rounded.
 *
 * The absolute anchor is chosen so the numbers land somewhere familiar rather than
 * to say anything about the bot: at 1200 for the current version, somebody who beats
 * it about nine times in ten settles near 1600, and somebody it beats sits below
 * 1200. Anchoring the bot at 1500 instead would put the whole family above average,
 * which reads as flattery.
 */
const BOT_RATINGS: Record<number, number> = { 1: 1000, 2: 1200 };

/**
 * A robot match older than bot versions at all — see `0006_bot_version.sql`, where
 * null means "before the question was asked" rather than "unknown".
 *
 * Rated as v1, which is the honest reading: those games were played against the
 * only bot that existed then.
 */
const UNVERSIONED_BOT_RATING = 1000;

export function botRating(version: number | null): number {
  return version === null ? UNVERSIONED_BOT_RATING : (BOT_RATINGS[version] ?? UNVERSIONED_BOT_RATING);
}

/** The share of a match the first player is expected to take, from the gap alone. */
export function expectedScore(rating: number, against: number): number {
  return 1 / (1 + 10 ** ((against - rating) / 400));
}

interface RatingRow {
  readonly account0: string | null;
  readonly account1: string | null;
  readonly bot_version: number | null;
  readonly token0: string;
  readonly token1: string;
  readonly winner: number;
}

/** How a seat is identified for rating: the account if there is one, else the device. */
function identityOf(account: string | null, token: string): string {
  return account === null ? `token:${token}` : `account:${account}`;
}

/** One point of a rating line: what it became, and who it was against. */
export interface RatingPoint {
  /** The bot faced, or null for a person — what marks where the opponent changed. */
  readonly botVersion: number | null;
  readonly rating: number;
}

/** How many points of a rating line travel. Enough for a season; bounded on purpose. */
export const HISTORY_LENGTH = 40;

export interface Ratings {
  /**
   * Every rating each identity has held, oldest first.
   *
   * Kept because the walk computes it anyway: drawing the line needed no new query
   * and no schema, only the intermediate values this used to throw away.
   */
  readonly history: Map<string, RatingPoint[]>;
  /** How many rated matches each identity has played. */
  readonly played: Map<string, number>;
  readonly rating: Map<string, number>;
}

/**
 * Every player's rating, from one pass over every match ever recorded.
 *
 * **Global on purpose, and recomputed rather than stored.** A rating is only
 * comparable if it comes out of the same pass as everybody else's, and Elo is
 * sequential — it depends on the order and on both ratings *at the time* — so it
 * cannot be derived from one account's slice. Recomputing also means it self-heals:
 * resetting a record, retuning a bot anchor or correcting a timestamp all just come
 * out right on the next read, where a stored column would need a migration and a
 * backfill to say the same thing.
 *
 * Ordered by `finished_at`, which is why the robot route records when the rubber
 * *ended* rather than when its report arrived — a queued result delivered days late
 * would otherwise sort after games played since and rewrite history.
 *
 * The volume this will ever see is a family's worth of card games, which is the same
 * reason `recordsFor` aggregates in TypeScript instead of SQL.
 */
export async function ratingsFor(env: Env): Promise<Ratings> {
  const rows = await env.DB.prepare(
    `SELECT account0, account1, bot_version, token0, token1, winner
     FROM results ORDER BY finished_at`,
  ).all<RatingRow>();

  const rating = new Map<string, number>();
  const played = new Map<string, number>();
  const history = new Map<string, RatingPoint[]>();

  for (const row of rows.results) {
    const seats = [
      { account: row.account0, token: row.token0 },
      { account: row.account1, token: row.token1 },
    ] as const;

    // A bot's rating is fixed, so it is read rather than looked up and never
    // written back. That is what stops the pool from being a closed loop.
    const of = (seat: (typeof seats)[number]): number =>
      seat.token === ROBOT_TOKEN
        ? botRating(row.bot_version)
        : (rating.get(identityOf(seat.account, seat.token)) ?? START_RATING);

    const before = [of(seats[0]), of(seats[1])] as const;

    for (const index of [0, 1] as const) {
      const seat = seats[index];
      if (seat.token === ROBOT_TOKEN) {
        continue;
      }
      const id = identityOf(seat.account, seat.token);
      const scored = row.winner === index ? 1 : 0;
      const expected = expectedScore(before[index], before[index === 0 ? 1 : 0]);
      const after = before[index] + K_FACTOR * (scored - expected);
      rating.set(id, after);
      played.set(id, (played.get(id) ?? 0) + 1);

      const line = history.get(id) ?? [];
      line.push({
        // The opponent's version, which is only a bot's to have. A person's match
        // carries null and so never draws a change marker.
        botVersion: seats[index === 0 ? 1 : 0].token === ROBOT_TOKEN ? row.bot_version : null,
        rating: Math.round(after),
      });
      history.set(id, line);
    }
  }

  return { history, played, rating };
}

/**
 * One account's rating, and the tokens it has claimed folded in.
 *
 * A person's games are split across their account and every device they played on
 * before signing in, so their rating has to be read from whichever identity the
 * matches actually landed under. Where both exist the account's is the answer: it is
 * the one that keeps accruing.
 */
export function ratingOf(
  ratings: Ratings,
  accountId: string,
  tokens: readonly string[],
): { readonly history: readonly RatingPoint[]; readonly played: number; readonly rating: number } {
  const ids = [`account:${accountId}`, ...tokens.map((token) => `token:${token}`)];
  const found = ids.filter((id) => ratings.rating.has(id));
  if (found.length === 0) {
    return { history: [], played: 0, rating: START_RATING };
  }
  // Whichever identity holds the most matches is the one that represents them; a
  // token with one anonymous rubber on it should not outrank an account with fifty.
  const best = found.reduce((a, b) =>
    (ratings.played.get(a) ?? 0) >= (ratings.played.get(b) ?? 0) ? a : b,
  );
  return {
    history: (ratings.history.get(best) ?? []).slice(-HISTORY_LENGTH),
    played: ratings.played.get(best) ?? 0,
    rating: Math.round(ratings.rating.get(best) ?? START_RATING),
  };
}
