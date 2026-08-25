import type { Env } from "./env.js";
import { PROVISIONAL_MATCHES, pinnedOpponents, ratingOf, ratingsFor } from "./ratings.js";
import type { PinnedOpponent, Ratings } from "./ratings.js";

/**
 * Where everybody stands, on the one scale that is not relative to a person.
 *
 * **This is the first thing here with no asker.** Every other read in `results.ts`
 * answers "how did *you* do" and reports a `pointsFor`; a board is two dozen rows
 * about other people, and the only part of it belonging to the reader is which row
 * is theirs. That difference is why it is a route of its own rather than a field on
 * the record, and why the screen drawing it is a separate view rather than one more
 * section of "Your record".
 *
 * It is also the first surface that shows one player another player's number
 * unprompted. Nothing here carries an account id or a device token — a token
 * reclaims a dropped seat and so is a credential rather than a label, which is the
 * whole reason `assignOpponentKeys` exists — so a row is a display name, a rating
 * and a count. Which row is *yours* is a boolean, not an identifier.
 */

/**
 * How many rows travel.
 *
 * A family-sized pool will never reach this; it is here so the payload is bounded
 * by something other than optimism. The asker's own row survives the cap even when
 * it falls outside — see `capped`.
 */
export const STANDINGS_LENGTH = 20;

/** One line of the board: a person, or one of the computers it is scaled against. */
export interface Standing {
  /** Which rung a computer row is pinned at. Null on a person's row. */
  readonly difficulty: string | null;
  /**
   * What to call them.
   *
   * Null on a computer row, which the client names for itself: the releases have
   * names, those belong in Settings, and across a board as across a table the
   * opponent is just the computer.
   */
  readonly name: string | null;
  /** Rated matches behind the number. Null for a computer, whose rating is pinned. */
  readonly played: number | null;
  /**
   * Where they stand among people.
   *
   * Null for a computer — it is a mark on the scale rather than a competitor — and
   * null while a rating is still settling, since ranking a number that is mostly
   * the starting 1500 would be ordering the prior rather than the players.
   */
  readonly rank: number | null;
  readonly rating: number;
  /** Which release a computer row is. Null on a person's row. */
  readonly version: number | null;
  /** The asker's own row, so a client can find it without being told who anyone is. */
  readonly you: boolean;
}

export interface Standings {
  /** How many people are ranked, which `ranked` may be capped below. */
  readonly of: number;
  /** Settled players by rating, with the computers interleaved where they fall. */
  readonly ranked: readonly Standing[];
  /** After how many matches a rating is ranked — the server's own definition. */
  readonly settledAfter: number;
  /**
   * Players with too little history to rank, by rating.
   *
   * Listed rather than hidden, for the reason the rating chart shades its opening
   * stretch instead of trimming it: everybody starts at 1500 and the first ten
   * results move by nearly a whole K, so these numbers are mostly the prior.
   * Leaving somebody off a board they belong on is worse than saying why they are
   * not ranked yet.
   */
  readonly settling: readonly Standing[];
}

/** A person's line, before the board decides where it goes. */
interface Player {
  readonly name: string;
  readonly played: number;
  readonly rating: number;
  readonly you: boolean;
}

/** Who has an account, and which devices each of them has claimed. */
export interface Pool {
  readonly accounts: readonly { readonly id: string; readonly name: string | null }[];
  readonly tokens: ReadonlyMap<string, readonly string[]>;
}

/**
 * Everybody who could appear on a board, in two small queries.
 *
 * Read whole rather than filtered in SQL, because the filter that matters — has
 * this account finished a rated match — is a fact about the rating walk rather than
 * about a row, and that walk has already happened by the time anybody asks.
 */
export async function poolFor(env: Env): Promise<Pool> {
  const accounts = await env.DB.prepare("SELECT id, name FROM accounts").all<{
    id: string;
    name: string | null;
  }>();
  const claimed = await env.DB.prepare("SELECT account_id, token FROM account_tokens").all<{
    account_id: string;
    token: string;
  }>();

  const tokens = new Map<string, string[]>();
  for (const row of claimed.results) {
    const held = tokens.get(row.account_id) ?? [];
    held.push(row.token);
    tokens.set(row.account_id, held);
  }

  return { accounts: accounts.results, tokens };
}

/**
 * Trims a list to what travels, without ever cutting the reader's own row.
 *
 * A board somebody cannot find themselves on is one nobody opens twice, and the
 * alternative — sending everything — puts no bound on the payload at all.
 */
function capped(rows: readonly Standing[], limit: number): readonly Standing[] {
  if (rows.length <= limit) {
    return rows;
  }
  const kept = rows.slice(0, limit);
  const mine = rows.find((row) => row.you);
  return mine === undefined || kept.includes(mine) ? kept : [...kept, mine];
}

/** Highest first, and on a tie whoever has more matches behind the number. */
function byStrength(a: Player, b: Player): number {
  return b.rating - a.rating || b.played - a.played || a.name.localeCompare(b.name);
}

function personRow(player: Player, rank: number | null): Standing {
  return {
    difficulty: null,
    name: player.name,
    played: player.played,
    rank,
    rating: player.rating,
    version: null,
    you: player.you,
  };
}

function botRow(bot: PinnedOpponent): Standing {
  return {
    difficulty: bot.difficulty,
    name: null,
    played: null,
    rank: null,
    rating: bot.rating,
    version: bot.version,
    you: false,
  };
}

/**
 * The board, from one rating walk and the pool it ran over.
 *
 * Pure on purpose: everything here worth getting right — the identity fold, who is
 * left off, where the computers land — is decided in this function, where it can be
 * tested without a database.
 *
 * **The fold is the part most likely to be wrong.** A person's matches are split
 * across their account and every device they played on before signing in, so a
 * board built off the rating map alone lists somebody twice: once as their account
 * and once as the phone they started on. `ratingOf` already resolves that for the
 * asker, by taking whichever identity holds the most matches, and using the same
 * function here is what keeps a board row agreeing with the number that person
 * reads on their own record.
 *
 * Three kinds of row are deliberately absent. An account with no name, because a
 * row reading "—" beside a rating is worse than a shorter list. An account that has
 * never finished a rated match, because an untouched 1500 is a starting value rather
 * than a rating. And a device token no account has claimed, because that is a
 * browser rather than a player and has nothing to be called.
 */
export function buildStandings(input: {
  readonly bots: readonly PinnedOpponent[];
  readonly me: string;
  readonly pool: Pool;
  readonly ratings: Ratings;
}): Standings {
  const players: Player[] = [];
  for (const account of input.pool.accounts) {
    const name = account.name?.trim() ?? "";
    if (name === "") {
      continue;
    }
    const found = ratingOf(input.ratings, account.id, input.pool.tokens.get(account.id) ?? []);
    if (found.played === 0) {
      continue;
    }
    players.push({
      name,
      played: found.played,
      rating: found.rating,
      you: account.id === input.me,
    });
  }

  const settled = players.filter((player) => player.played >= PROVISIONAL_MATCHES).sort(byStrength);
  const settling = players.filter((player) => player.played < PROVISIONAL_MATCHES).sort(byStrength);

  // Ranked among people first, then the computers dropped in where their pinned
  // ratings fall. A person sorts above a computer on the same number, because
  // matching it is not passing it and the order should not imply otherwise.
  const ranked = [
    ...settled.map((player, index) => personRow(player, index + 1)),
    ...input.bots.map(botRow),
  ].sort((a, b) => b.rating - a.rating || (a.rank === null ? 1 : 0) - (b.rank === null ? 1 : 0));

  return {
    of: settled.length,
    // The cap counts people, so the reference rows cannot push a player off the
    // end of the list they exist to give a scale to.
    ranked: capped(ranked, STANDINGS_LENGTH + input.bots.length),
    settledAfter: PROVISIONAL_MATCHES,
    settling: capped(
      settling.map((player) => personRow(player, null)),
      STANDINGS_LENGTH,
    ),
  };
}

/**
 * Where the asker stands, for the record screen's own rating block.
 *
 * Read off the same board the standings route builds, so a rank shown beside a
 * rating and a rank shown on the list cannot disagree. Null while that rating is
 * settling, which is the honest answer rather than a missing one: there is a
 * position, and it would mostly be a position among starting values.
 */
export function rankOf(standings: Standings): { readonly of: number; readonly rank: number } | null {
  const mine = standings.ranked.find((row) => row.you);
  const rank = mine?.rank ?? null;
  return rank === null ? null : { of: standings.of, rank };
}

/** The board, for the route. Its own walk, since nothing else on that request has one. */
export async function standingsFor(env: Env, accountId: string): Promise<Standings> {
  const [ratings, pool] = await Promise.all([ratingsFor(env), poolFor(env)]);
  return buildStandings({ bots: pinnedOpponents(), me: accountId, pool, ratings });
}
