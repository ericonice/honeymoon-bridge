import type { MatchFormat, PlayerId } from "@hb/engine";
import type { Env } from "./env.js";
import {
  botAnchors,
  botRating,
  pinnedOpponents,
  ratingOf,
  ratingsFor,
  START_RATING,
  stepFor,
} from "./ratings.js";
import type { RatingPoint, Ratings } from "./ratings.js";
import { buildStandings, poolFor, rankOf } from "./standings.js";

/**
 * The token standing in for the computer.
 *
 * Not a device and not an account. Deliberately not a UUID, so it cannot collide
 * with a real `playerToken`, and recognizable on sight in the table.
 */
export const ROBOT_TOKEN = "@robot";

/** One seat's side of a finished rubber, as the table knew it. */
export interface FinishedSeat {
  readonly accountId: string | null;
  readonly nickname: string;
  readonly points: number;
  readonly token: string;
}

/**
 * What `results.winner` holds when neither side won.
 *
 * A sentinel rather than a nullable column, because the column is `NOT NULL` and a
 * migration is not needed to add a value it can already hold — the same reasoning
 * `ratings.ts` gives for recomputing rather than storing. Negative so it can never
 * be mistaken for a seat: `PlayerId` is 0 or 1, and every comparison here is
 * against a seat.
 *
 * It exists because duplicate made a draw *common*. A board is flat whenever both
 * of its runs come to the same score, so a short session really is level a good
 * fraction of the time — and a drawn match was previously not recorded at all,
 * which is the same shape of loss as the missing rubber `outbox.ts` was built for.
 * A rubber can tie as well, on exactly equal totals, and that was silently
 * unrecorded too.
 */
export const DRAWN = -1;

/**
 * How a stored row came out, from one seat.
 *
 * Its own function because it was wrong inline, in the way that produces the wrong
 * answer *twice*: `winner === seat` reads a draw as a loss for both players. Three
 * outcomes need three names, and a rule about hidden state — which a sentinel in a
 * `NOT NULL` column is — should have one testable answer rather than a comparison
 * repeated at four call sites.
 */
export type Outcome = "drawn" | "lost" | "won";

export function outcomeOf(winner: number, seat: PlayerId): Outcome {
  if (winner === DRAWN) {
    return "drawn";
  }
  return winner === seat ? "won" : "lost";
}

export interface FinishedRubber {
  /** Which computer opponent, for a robot rubber. Null for a game between people. */
  readonly botVersion?: number | null;
  readonly code: string;
  readonly deals: number;
  /** Which difficulty rung a robot rubber was played at. Null against a person. */
  readonly difficulty?: string | null;
  readonly format: MatchFormat;
  /**
   * Played on an earlier match's boards, from the other side.
   *
   * Optional, because every build the service worker keeps in circulation reports
   * without it — and absent reads as "not repeated", which is what those builds
   * could only ever have played.
   */
  readonly repeated?: boolean;
  readonly seats: readonly [FinishedSeat, FinishedSeat];
  /** The seat that won, or `DRAWN`. */
  readonly winner: PlayerId | typeof DRAWN;
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
       (id, finished_at, table_code, winner, deals, format, bot_version, difficulty, repeated,
        account0, token0, nickname0, points0,
        account1, token1, nickname1, points1)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      now,
      rubber.code,
      rubber.winner,
      rubber.deals,
      rubber.format,
      rubber.botVersion ?? null,
      rubber.difficulty ?? null,
      // Stored as 0 rather than left null when the client did say, so the column
      // distinguishes "said no" from "never asked" even though both read the same.
      rubber.repeated === true ? 1 : 0,
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
 * that maps to nothing, since the token is the other way a row is recognized.
 * What the opponent keeps is a game against somebody with the name that was
 * used at the time, which is the truth of what happened.
 *
 * **Achievements are asked about rather than assumed**, which is `achievements`.
 * The argument for taking them automatically is real and is about the counters:
 * Hands Played is a running tally of exactly the matches being deleted, so
 * leaving it behind leaves a count of 257 outliving the 257 hands it counted.
 * The argument against is about everything else. A record is relative and
 * ongoing, so wiping it is a fresh start, which is a coherent thing to want on
 * its own; a collection of titles has no fresh start, and somebody starting a
 * new season against their family has no reason to give up a Grand Slam they
 * made in March. Those are two different wishes and the caller says which.
 *
 * Done last on purpose. Every step here can fail on its own — there is no
 * transaction spanning them — so the order is chosen so that a partial failure
 * lands on a state the app has already shipped and tolerated: matches gone,
 * achievements still there. The reverse order would invent a new one.
 */
export async function resetRecord(
  env: Env,
  accountId: string,
  { achievements }: { readonly achievements: boolean },
): Promise<number> {
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
      // A value nothing maps to, so the row can never be recognized as this
      // person's again — including by an account that later claims the device
      // token this replaces.
      .bind(accountId, ROBOT_TOKEN, `forgotten:${crypto.randomUUID()}`)
      .run();
    detached += result.meta.changes;
  }

  if (achievements) {
    // Batched so the two halves of "what this account has earned" cannot come
    // apart from each other, even though neither can be batched with the work
    // above it.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM achievement_counters WHERE account_id = ?").bind(accountId),
      env.DB.prepare("DELETE FROM achievement_unlocks WHERE account_id = ?").bind(accountId),
    ]);
  }

  // The number of *matches*, always — the achievements are asked about
  // separately and the caller already knows what it asked for.
  return removed.meta.changes + detached;
}

interface ResultRow {
  readonly account0: string | null;
  readonly account1: string | null;
  readonly bot_version: number | null;
  readonly difficulty: string | null;
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
 * One finished match against one opponent, as that opponent's own row shows it.
 *
 * Neither who nor which format: both are fixed by the `OpponentRecord` this hangs
 * off, and repeating them per match would be several hundred bytes of the same two
 * strings on a screen a family reads.
 */
export interface OpponentMatch {
  /** Null for a person, and null for a robot game older than bot versions. */
  readonly botVersion: number | null;
  readonly deals: number;
  /** Which rung it was played at. Null for a person, or before the setting existed. */
  readonly difficulty: string | null;
  readonly finishedAt: number;
  /** This match's own length, within whichever family its `OpponentRecord` groups. */
  readonly format: MatchFormat;
  readonly pointsAgainst: number;
  readonly pointsFor: number;
  /** Neither won nor lost. `won` false with this false is a loss. */
  readonly drawn: boolean;
  readonly won: boolean;
}

/** One length's own tally, within a combined record — see `OpponentRecord.byLength`. */
export interface LengthBreakdown {
  readonly deals: number;
  readonly drawn: number;
  readonly lost: number;
  readonly won: number;
}

/**
 * How many of an opponent's matches travel with their record.
 *
 * Enough to cover the sittings somebody would still remember, and bounded because
 * a few hundred rubbers against the computer is a realistic total and this rides on
 * a settings screen. The caller can tell it has been truncated — `won + lost` is
 * the real count — and says so rather than quietly showing a partial history.
 */
const MATCHES_PER_OPPONENT = 20;

/**
 * A record against one opponent at one match *family*, from the asker's side.
 *
 * One per opponent per family, not per format: a single game and a full rubber
 * are the same achievement at two different lengths and combine into one
 * record — `format` reads "rubber" for both — where mirror and duplicate stay
 * apart, since those really are different games rather than different
 * lengths of one. `byLength` is where the length itself is still visible.
 */
export interface OpponentRecord {
  /**
   * How a combined rubber-family record splits between a single game and a
   * full rubber. Present only for that family — mirror and duplicate have no
   * such split to make — and computed over every match, not just the ones in
   * `matches`, the same as every other total here.
   */
  readonly byLength?: { readonly game: LengthBreakdown; readonly rubber: LengthBreakdown };
  /** Deals across all of these matches, which is how long the sittings ran. */
  readonly deals: number;
  /** Matches that ended level. Zero for every format but duplicate, in practice. */
  readonly drawn: number;
  /** The family these are grouped by — "rubber" covers both a game and a rubber. */
  readonly format: MatchFormat;
  readonly lastPlayed: number;
  readonly lost: number;
  /**
   * The most recent matches against them, newest first, up to
   * `MATCHES_PER_OPPONENT`.
   *
   * Carried here rather than fetched per opponent, because there is nothing to
   * fetch *by*: `opponentKey` is handed out positionally per response, so it is
   * not an identifier a client can send back — a new opponent would shift it. And
   * `recordsFor` has already read every row to tally these totals, so grouping
   * them costs no extra query.
   */
  readonly matches: readonly OpponentMatch[];
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
  /**
   * Groups this row with the same opponent's row in the other format, without
   * saying who they are beyond that. See `assignOpponentKeys` — it is neither
   * their account id nor their device token, on purpose: the token reclaims a
   * seat after a drop, so handing it to another account's client would hand
   * over a working credential rather than a label. Two rows get the same key
   * only when they really are the same account or device; nothing about
   * *which* one is recoverable from it.
   */
  readonly opponentKey: string;
  readonly pointsAgainst: number;
  readonly pointsFor: number;
  /**
   * What this opponent is rated — see `ratings.ts`.
   *
   * For the computer it is the pinned rating of the newest version played against,
   * which is what "what the computer is rated" can mean for a row that spans
   * versions; the panel's own history is where the change is marked.
   */
  readonly rating: number;
  readonly won: number;
}

export interface Records {
  /**
   * What the computer is worth on each rung, by release.
   *
   * Sent rather than computed on the client so the number beside the opponent's
   * seat, the number on the difficulty row in Settings and the number the rating
   * walk actually used are **one number from one place**. Three copies of an
   * anchor is three things to forget to retune, and the ladder is provisional —
   * it is going to be retuned.
   *
   * Keyed by version then rung, both as strings because that is what JSON does to
   * an object key anyway. Absent from a server too old to send it, which has to
   * read as "no anchors to show" rather than as an error.
   */
  readonly anchors: Record<string, Record<string, number>>;
  /**
   * The same table for a two-game match, where the computer meets the second half's
   * boards remembering them and a person does not.
   *
   * A second table rather than a term the client adds, because the rule is not "mirror
   * is worth forty" but "worth forty at the rungs that carry a board into the replay" —
   * and a client applying that is a second copy of it. See `MIRROR_RECALL_OFFSET`.
   */
  readonly mirrorAnchors: Record<string, Record<string, number>>;
  readonly opponents: OpponentRecord[];
  /** The asker's own rating, the matches it rests on, and how it got there. */
  readonly rating: {
    readonly history: readonly RatingPoint[];
    /**
     * How many people are ranked on the board — the "of" in "3rd of 9".
     *
     * Null alongside a null `rank`, and for the same reason: a position needs
     * something to be a position among.
     */
    readonly of: number | null;
    readonly played: number;
    /**
     * Where this rating stands among everybody's — see `standings.ts`.
     *
     * Carried with the record rather than fetched, because the walk that answers
     * it has already been made to produce the rating above; the board itself is
     * a route of its own, so nobody reading their own w-l pays for everybody
     * else's rows. Null while the rating is still settling, which is what the
     * board does with it too.
     */
    readonly rank: number | null;
    /**
     * What their *next* result will move them by.
     *
     * Sent rather than derived on the client, which would otherwise need a copy
     * of both K constants and the provisional rule to say what a finished match
     * was worth. One number, already accounting for how many they have played,
     * is the whole of it — and it cannot drift out of step with the walk the way
     * a second copy of the rule would.
     */
    readonly step: number;
    readonly value: number;
  };
  /** Kept apart from the rest — see `recordsFor`. One entry per format played. */
  readonly robot: OpponentRecord[];
}

// `opponentKey` is assigned once the whole set is known — see
// `assignOpponentKeys` — so it is not part of a row while it is still being
// tallied.
export type Tallied = Omit<OpponentRecord, "opponentKey" | "rating"> & {
  readonly account: string | null;
  readonly token: string;
};

/**
 * A single game and a full rubber group into one record; mirror and
 * duplicate never do, since those are different games rather than different
 * lengths of one.
 */
function formatFamily(format: MatchFormat): MatchFormat {
  return format === "game" ? "rubber" : format;
}

function emptyLength(): LengthBreakdown {
  return { deals: 0, drawn: 0, lost: 0, won: 0 };
}

function addedLength(base: LengthBreakdown, delta: LengthBreakdown): LengthBreakdown {
  return {
    deals: base.deals + delta.deals,
    drawn: base.drawn + delta.drawn,
    lost: base.lost + delta.lost,
    won: base.won + delta.won,
  };
}

/**
 * Folds one match into a rubber-family record's length split. Only ever
 * called within that family, so `format` here is always "game" or "rubber".
 */
function withLength(
  running: NonNullable<OpponentRecord["byLength"]> | undefined,
  format: MatchFormat,
  delta: LengthBreakdown,
): NonNullable<OpponentRecord["byLength"]> {
  const base = running ?? { game: emptyLength(), rubber: emptyLength() };
  return format === "game"
    ? { game: addedLength(base.game, delta), rubber: base.rubber }
    : { game: base.game, rubber: addedLength(base.rubber, delta) };
}

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
  const mineTokens = new Set(tokens.results.map((row) => row.token));

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
    account === accountId || (account === null && mineTokens.has(token));

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
    // Split by family as well, so a rubber-length record and a mirror or
    // duplicate record stay apart — a single game and a full rubber, though,
    // fold into the same family. See `formatFamily`.
    const family = formatFamily(row.format);
    const key = `${theirAccount ?? `token:${theirToken}`}|${family}`;
    const running = tally.get(key);
    // Three outcomes, not two. `winner` is a seat or `DRAWN`, and reading a draw
    // as `winner === seat` would have made it a **loss for both players** — which
    // is not a rounding error but the wrong answer twice. Duplicate is what
    // brought it up: a board is flat whenever both runs come to the same score, so
    // a short session really is drawn a good fraction of the time. A rubber can
    // tie too, on equal totals, and that was silently unrecorded before this.
    const outcome = outcomeOf(row.winner, seat);
    const drawn = outcome === "drawn";
    const won = outcome === "won";

    // Rows arrive oldest-first, so this appends in order and the newest end is
    // the tail — trimmed once at the end rather than on every row.
    const match: OpponentMatch = {
      botVersion: theirToken === ROBOT_TOKEN ? row.bot_version : null,
      difficulty: theirToken === ROBOT_TOKEN ? row.difficulty : null,
      deals: row.deals,
      finishedAt: row.finished_at,
      format: row.format,
      pointsAgainst: theirPoints,
      pointsFor: myPoints,
      // A drawn match is neither won nor lost, and the pair says which without a
      // third field: `won` false and `drawn` true is a draw, `won` false and
      // `drawn` false is a loss.
      drawn,
      won,
    };

    tally.set(key, {
      account: theirAccount,
      // Only a rubber-family record has a length to split — see `withLength`,
      // which is only ever handed "game" or "rubber" for exactly that reason.
      // The key is omitted rather than set to `undefined` for every other
      // family: `exactOptionalPropertyTypes` treats those as different things.
      ...(family === "rubber"
        ? {
            byLength: withLength(running?.byLength, row.format, {
              deals: row.deals,
              drawn: drawn ? 1 : 0,
              lost: won || drawn ? 0 : 1,
              won: won ? 1 : 0,
            }),
          }
        : {}),
      deals: (running?.deals ?? 0) + row.deals,
      format: family,
      lastPlayed: row.finished_at,
      drawn: (running?.drawn ?? 0) + (drawn ? 1 : 0),
      lost: (running?.lost ?? 0) + (won || drawn ? 0 : 1),
      matches: [...(running?.matches ?? []), match],
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

  // Newest first, and only as many as travel — see `MATCHES_PER_OPPONENT`.
  const all = [...tally.values()].map((entry) => ({
    ...entry,
    matches: entry.matches.slice(-MATCHES_PER_OPPONENT).reverse(),
  }));
  const opponentKeys = assignOpponentKeys(all);
  // One global pass, because a rating is only comparable if it comes out of the
  // same walk as everybody else's — see `ratingsFor`.
  const ratings = await ratingsFor(env);
  const mine = ratingOf(ratings, accountId, [...mineTokens]);
  // The same board the standings route serves, so a rank beside a rating and a
  // rank on the list cannot disagree. Two small queries on top of a walk that has
  // already happened, which is why the position rides here and the rows do not.
  const place = rankOf(
    buildStandings({ bots: pinnedOpponents(), me: accountId, pool: await poolFor(env), ratings }),
  );

  return {
    anchors: botAnchors(),
    mirrorAnchors: botAnchors("mirror"),
    opponents: await withNames(
      env,
      all.filter((entry) => entry.token !== ROBOT_TOKEN),
      opponentKeys,
      ratings,
    ),
    rating: {
      history: mine.history,
      of: place?.of ?? null,
      played: mine.played,
      rank: place?.rank ?? null,
      step: stepFor(mine.played),
      value: mine.rating,
    },
    robot: all
      .filter((entry) => entry.token === ROBOT_TOKEN)
      .map((entry) => strip(entry, opponentKeys, ratings))
      .sort((a, b) => b.lastPlayed - a.lastPlayed),
  };
}

/**
 * A synthetic id for grouping one opponent's rubber row with their game row
 * on the client, assigned fresh on every call rather than derived from
 * anything that outlives this one response. Two rows get the same key only
 * when they share an account or, lacking one, a device token — but the
 * identity itself never leaves this function, only which rows matched it.
 */
export function assignOpponentKeys(entries: readonly Tallied[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const entry of entries) {
    const identity = entry.account ?? `token:${entry.token}`;
    if (!keys.has(identity)) {
      keys.set(identity, `opponent-${keys.size}`);
    }
  }
  return keys;
}

/**
 * What this opponent is rated.
 *
 * The computer's is pinned and never learned, and the version taken is the newest
 * one this row has a match against — `matches` is newest-first by the time this
 * runs. A person's is whatever the global pass put under the identity their matches
 * landed on, which is their account where they have one and the device otherwise.
 */
function ratingFor(entry: Tallied, ratings: Ratings): number {
  if (entry.token === ROBOT_TOKEN) {
    // The newest match's rung as well as its version — `matches` is newest-first
    // by the time this runs. One row pools every rung the computer was played at,
    // so this says what you are facing *now* rather than averaging four opponents
    // into a number that describes none of them.
    const newest = entry.matches[0];
    return botRating(newest?.botVersion ?? null, newest?.difficulty ?? null);
  }
  const identity = entry.account === null ? `token:${entry.token}` : `account:${entry.account}`;
  return Math.round(ratings.rating.get(identity) ?? START_RATING);
}

function strip(entry: Tallied, keys: Map<string, string>, ratings: Ratings): OpponentRecord {
  const { account: _account, token: _token, ...record } = entry;
  const identity = entry.account ?? `token:${entry.token}`;
  // `keys` was built from the same set this entry came from, so its identity
  // is always in it.
  return { ...record, opponentKey: keys.get(identity)!, rating: ratingFor(entry, ratings) };
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
async function currentNamesFor(
  env: Env,
  accountIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(accountIds.flatMap((id) => (id === null ? [] : [id])))];
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

  return names;
}

async function withNames(
  env: Env,
  records: readonly Tallied[],
  keys: Map<string, string>,
  ratings: Ratings,
): Promise<OpponentRecord[]> {
  const names = await currentNamesFor(
    env,
    records.map((r) => r.account),
  );

  return records
    .map((record) => ({
      ...strip(record, keys, ratings),
      name: (record.account === null ? null : names.get(record.account)) ?? record.name,
    }))
    .sort((a, b) => b.lastPlayed - a.lastPlayed);
}

/** One finished match, from the asker's side, newest first. */
export interface MatchRecord {
  /** Which computer opponent, for a robot match. Null against a person. */
  readonly botVersion: number | null;
  readonly deals: number;
  readonly finishedAt: number;
  readonly format: MatchFormat;
  readonly opponentName: string;
  readonly pointsAgainst: number;
  readonly pointsFor: number;
  /** Neither won nor lost. `won` false with this false is a loss. */
  readonly drawn: boolean;
  readonly won: boolean;
}

/**
 * The most recent matches this account finished, one row per match rather
 * than tallied by opponent — `recordsFor` answers "how am I doing against
 * them", this answers "what did I just play".
 */
/** One seat of a finished match, as it was recorded. */
export interface MatchSeat {
  /** The name at the time, not the account's name now — see `everyRecentMatch`. */
  readonly name: string;
  readonly points: number;
  readonly robot: boolean;
}

/**
 * A finished match with no point of view.
 *
 * Everything else here answers "how did *you* do", which is why it takes an
 * account and reports a `pointsFor` and a `pointsAgainst`. This one has no
 * asker: it is two seats and a winner, which is the only honest shape for a
 * list of games somebody else played.
 */
export interface AnyMatch {
  readonly botVersion: number | null;
  readonly deals: number;
  readonly difficulty: string | null;
  readonly finishedAt: number;
  readonly format: MatchFormat;
  readonly players: readonly [MatchSeat, MatchSeat];
  /** The seat that won, or `DRAWN`. */
  readonly winner: PlayerId | typeof DRAWN;
}

/**
 * The most recently finished matches, by anybody.
 *
 * Not scoped to an account, which makes it the same kind of thing as
 * `/api/hands` rather than the same kind as `recordsFor` — so it is gated on the
 * playtester list rather than on an ordinary session, and the route answers 404
 * rather than 401 to anyone else, since a route that says "not authorized" has
 * admitted it exists.
 *
 * Names are the ones recorded on the row rather than what those accounts are
 * called now. That is the opposite of `withNames`, and deliberate: this list is
 * for looking at what happened, and somebody who has since renamed themselves
 * still played that game under the name on it.
 */
export async function everyRecentMatch(env: Env, limit: number): Promise<AnyMatch[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM results ORDER BY finished_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<ResultRow>();

  return rows.results.map((row) => ({
    // Only a robot seat has a version or a rung, and the robot is always seat 1
    // on a robot row — but read from the token rather than assumed, since a
    // networked row has neither and must not borrow one.
    botVersion: row.token1 === ROBOT_TOKEN ? row.bot_version : null,
    deals: row.deals,
    difficulty: row.token1 === ROBOT_TOKEN ? row.difficulty : null,
    finishedAt: row.finished_at,
    format: row.format,
    players: [
      { name: row.nickname0, points: row.points0, robot: row.token0 === ROBOT_TOKEN },
      { name: row.nickname1, points: row.points1, robot: row.token1 === ROBOT_TOKEN },
    ] as const,
    // `DRAWN` passes straight through: this is the playtester view of every match
    // ever recorded, and a reader wanting to know a session was level is better
    // served by the sentinel than by a seat that did not win.
    winner: row.winner as PlayerId | typeof DRAWN,
  }));
}

export async function recentMatchesFor(
  env: Env,
  accountId: string,
  limit: number,
): Promise<MatchRecord[]> {
  const tokens = await env.DB.prepare("SELECT token FROM account_tokens WHERE account_id = ?")
    .bind(accountId)
    .all<{ token: string }>();
  const mine = new Set(tokens.results.map((row) => row.token));
  const isMine = (account: string | null, token: string): boolean =>
    account === accountId || (account === null && mine.has(token));

  const rows = await env.DB.prepare(
    `SELECT * FROM results
     WHERE account0 = ?1 OR account1 = ?1 OR token0 IN (
       SELECT token FROM account_tokens WHERE account_id = ?1
     ) OR token1 IN (
       SELECT token FROM account_tokens WHERE account_id = ?1
     )
     ORDER BY finished_at DESC
     LIMIT ?2`,
  )
    .bind(accountId, limit)
    .all<ResultRow>();

  const perspectives = rows.results.map((row) => {
    const seat: PlayerId = isMine(row.account0, row.token0) ? 0 : 1;
    const them = seat === 0 ? 1 : 0;
    const theirAccount = them === 0 ? row.account0 : row.account1;
    const theirToken = them === 0 ? row.token0 : row.token1;

    return {
      account: theirAccount,
      botVersion: theirToken === ROBOT_TOKEN ? row.bot_version : null,
      difficulty: theirToken === ROBOT_TOKEN ? row.difficulty : null,
      deals: row.deals,
      finishedAt: row.finished_at,
      format: row.format,
      name: them === 0 ? row.nickname0 : row.nickname1,
      pointsAgainst: them === 0 ? row.points0 : row.points1,
      pointsFor: seat === 0 ? row.points0 : row.points1,
      drawn: outcomeOf(row.winner, seat) === "drawn",
      won: outcomeOf(row.winner, seat) === "won",
    };
  });

  const names = await currentNamesFor(
    env,
    perspectives.map((p) => p.account),
  );

  return perspectives.map((p) => ({
    botVersion: p.botVersion,
    deals: p.deals,
    finishedAt: p.finishedAt,
    format: p.format,
    opponentName: (p.account === null ? null : names.get(p.account)) ?? p.name,
    drawn: p.drawn,
    pointsAgainst: p.pointsAgainst,
    pointsFor: p.pointsFor,
    won: p.won,
  }));
}
