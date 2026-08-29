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
 * How far a result moves a rating that has barely any results behind it.
 *
 * **Everybody starts at 1500 and the strongest bot is anchored at 1400, so a new
 * player's number begins a hundred points too high and stays there.** At the
 * settled K a break-even run sheds about four points a match, so the starting
 * prior takes tens of games to wash out — and in a pool that plays a handful of
 * rubbers a week, tens of games is most of a season. That is structural
 * flattery: being told you are better than you are, by the arithmetic rather
 * than by a wrong constant, which is the error this file argues against
 * everywhere else.
 *
 * Measured against one real history of nine matches: a flat K put that player at
 * 1423 where their own results imply somewhere near 1280. Doubling K for the
 * first ten puts them at 1361 on identical data — not the right answer, but a
 * great deal less of the prior.
 *
 * A provisional period is what chess federations do for exactly this, and the
 * trade is worth stating: an early loss moves the number by about 36 points
 * rather than 18, so a rating in its first ten matches is visibly jumpy. That is
 * the cost of it meaning something after ten games instead of thirty.
 *
 * **It does not make a small sample more informative**, only faster to converge.
 * Six matches against one opponent is consistent with a range hundreds of points
 * wide, and a bigger K reaches a point inside that range sooner without knowing
 * any better which point is right.
 */
export const PROVISIONAL_K_FACTOR = 64;

/** How many matches count as still settling. Ten is the chart's own shaded stretch. */
export const PROVISIONAL_MATCHES = 10;

/**
 * The step this result should move a rating by, from how much history is behind it.
 *
 * Counted per identity rather than globally, so somebody joining a pool that has
 * been playing for months still gets their own settling period.
 */
export function stepFor(played: number): number {
  return played < PROVISIONAL_MATCHES ? PROVISIONAL_K_FACTOR : K_FACTOR;
}

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
 *
 * v3's spacing is measured the same way and, unlike v1's, can be measured again
 * whenever anybody wants to, because that release is still playable:
 * `npm run bench:rubber --workspace @hb/web -- 70 8 objective=equity nodouble`.
 *
 * **Which card play it is measured under changes the answer, and v3 is anchored
 * below all of it on purpose.** Against v2 with heuristic card play on both sides
 * it wins 78.9% of rubbers, a 229-point gap. With eight-sample solver card play it
 * wins 65.7% over 140 rubbers, a 113-point gap. The shipped strength is sixty
 * samples, which is neither, and measuring there is too slow to have been done —
 * but the gap narrowed at every step toward better card play, which is the reason
 * to distrust the direction rather than the size.
 *
 * **It started at 1250 and play said to move it, which is what that was for.** The
 * fifty-point gap was chosen below every measurement, on the reasoning that being
 * told you are better than you are is the error nobody notices. The predicted cost
 * then arrived exactly as written: this account went from 21–2 against v2 to losing
 * repeatedly against v3, which under a too-low anchor reads as *the player getting
 * worse* rather than as a stronger opponent.
 *
 * It is 1400 now, and the number is the sum of two measurements rather than a
 * response to a losing streak. The bench puts v3's bidder 113 points above v2's
 * under solver card play; the bid search, priced separately at 40 rubbers a lever,
 * is worth about another 108. That is ~1420, and 1400 is that rounded down —
 * conservative in the same direction as before, just no longer wrong by a factor.
 *
 * **What made the correction cheap is that nothing here is stored.** Ratings are
 * recomputed on every read, so raising an anchor fixes the whole history at once
 * rather than only future games — every match somebody lost to an under-rated bot
 * is repriced. That is the property that makes starting low safe, and it is worth
 * keeping in mind before anyone proposes a stored rating column.
 *
 * **The cost of being wrong low is worth naming, because it is not nothing.**
 * If v3 really is stronger and this says it is not, then somebody beating it less
 * often than they beat v2 reads as *the player getting worse* — the same error as
 * flattery, pointing the other way. The chart's version ticks are what explains the
 * bend when that happens.
 *
 * **What would settle it is not more v3.** With one person, opponent strength and
 * that person improving are the same signal — this account is 6-2 against v1 and
 * 21-2 against v2, which taken at face value makes v2 the weaker bot, and the same
 * period is when they got better. The measurement that works is alternating the
 * releases in one stretch of play, which is what keeping v2 selectable is for:
 * same person, same week, and the difference between the two records is the gap.
 *
 * `nodouble` in both, because the oracle doubler handicaps whichever seat it is
 * applied to under heuristic card play — see `bench/rubber.ts`.
 *
 * **Add a version here before the client that plays it is deployed.** `botRating`
 * falls back to the unversioned rating for anything it does not recognise, so a
 * client shipped first would have every one of its matches rated as beating the
 * weakest bot in this table, quietly inflating everybody.
 */
const BOT_RATINGS: Record<number, number> = { 1: 1000, 2: 1200, 3: 1400 };

/**
 * A robot match older than bot versions at all — see `0006_bot_version.sql`, where
 * null means "before the question was asked" rather than "unknown".
 *
 * Rated as v1, which is the honest reading: those games were played against the
 * only bot that existed then.
 */
const UNVERSIONED_BOT_RATING = 1000;

/**
 * What each difficulty rung is worth, relative to the hardest.
 *
 * The version says *which* computer somebody played; this says how hard it was
 * asked to play, and the two are independent — every release can be played on
 * every rung, so an anchor per rung per version would be a table of numbers
 * nobody will ever measure. An offset applied to the version's anchor is the same
 * claim with one number per rung: **a rung weakens the bot by about this much
 * whichever release is underneath it.** That is an assumption, and it is the one
 * worth stating out loud, because the levers a rung pulls — recall, samples,
 * search time — are shared by every release.
 *
 * Zero at the top on purpose. `BOT_RATINGS` is anchored on the strongest setting
 * because that is what every measurement in `bench/rubber.ts` was taken at and
 * what the app plays by default, so the rungs hang below it rather than the whole
 * table shifting when one is retuned.
 *
 * **These are measured, and the first set was not.** The original ladder guessed
 * four rungs and three of them turned out to be the same opponent — Tournament
 * against Championship came back 40–40 over 80 rubbers. What replaced the guess
 * was one run per lever, each moving a single setting away from Championship:
 * memory is worth nothing (57.5% ± 7.5, the wrong sign if anything), the sample
 * count about 70, the bid search about 108, and turning the solver off entirely
 * about 269.
 *
 * **The levers do not add up, which is why the bottom rung is not simply more of
 * them.** Stacking no-solver and no-search reached −261 rather than the −380 the
 * parts predict: turning off one way of thinking makes the other matter less. So
 * Kitchen bids by `simpleBidder` as well — a different failure mode rather than a
 * deeper one, and unlike the rest it *did* compose, taking the rung to **7.5% over
 * 40 rubbers, 8.9 standard errors, −357**.
 *
 * Club is Kitchen's old build without the inert memory change and carries that
 * run's own 80 rubbers at 23.8%, so **−191**.
 *
 * Rounded on purpose, and rounded *toward zero* in both cases. The instrument's
 * error bar is about ±5 on a win rate percentage, which is ±40 here, so quoting
 * −191 and −357 would claim a precision the measurement does not have. Toward
 * zero is the conservative direction: a rung rated slightly stronger than it
 * really plays gives slightly less credit for beating it, and being told you are
 * better than you are is the error nobody notices.
 *
 * **Club's figure is inferred rather than run directly.** It is that 80-rubber
 * measurement's configuration apart from recall, and recall measured as worth
 * nothing — a good inference, but not the same as having run it. Worth doing
 * properly if these are retuned.
 *
 * Safe to ship provisional, for the same reason v3's anchor was: nothing here is
 * stored. A re-spaced ladder comes out right on the next read for everybody at
 * once, where a stored column would need a migration and a backfill.
 */
const DIFFICULTY_OFFSETS: Record<string, number> = {
  championship: 0,
  club: -200,
  kitchen: -350,
};

/**
 * The safest reading of a rung this server has never heard of.
 *
 * The weakest known one, so an unrecognised rung earns the *fewest* points to
 * beat. This is the same conservatism as anchoring v3 low, and for the same
 * reason: the cost of guessing high is telling a family they are better than they
 * are, which nothing later corrects because they will not notice. A client can
 * ship a new rung ahead of the server — the service worker keeps old builds in
 * circulation and deploys are two commands — so this case is real rather than
 * theoretical, and the rule is the one `BOT_RATINGS` already states: add the rung
 * here before the client that plays it is deployed.
 */
function unknownRungOffset(): number {
  return Math.min(...Object.values(DIFFICULTY_OFFSETS));
}

/**
 * What the computer was worth in one match, from which release it was and how
 * hard it was set to play.
 *
 * A null difficulty is a match from before the setting existed — see
 * `0009_result_difficulty.sql` — and is rated at the top rung, which is the
 * honest reading rather than a default: the bot had perfect recall and the full
 * sample count in every one of those games, because there was no way to ask it
 * for anything less.
 */
export function botRating(version: number | null, difficulty: string | null = null): number {
  const base =
    version === null ? UNVERSIONED_BOT_RATING : (BOT_RATINGS[version] ?? UNVERSIONED_BOT_RATING);
  if (difficulty === null) {
    return base;
  }
  return base + (DIFFICULTY_OFFSETS[difficulty] ?? unknownRungOffset());
}

/**
 * What every known release is worth on every known rung.
 *
 * Handed to the client so the anchors it displays are the ones the rating walk
 * used, rather than a second copy that has to be kept in step by hand. Small
 * enough to send whole — a release times a rung is a dozen numbers — and sending
 * it whole means a client can show the anchor for a release it is not currently
 * playing, which the opponent picker needs.
 */
export function botAnchors(): Record<string, Record<string, number>> {
  const anchors: Record<string, Record<string, number>> = {};
  for (const version of Object.keys(BOT_RATINGS)) {
    const rungs: Record<string, number> = {};
    for (const rung of Object.keys(DIFFICULTY_OFFSETS)) {
      rungs[rung] = botRating(Number(version), rung);
    }
    anchors[version] = rungs;
  }
  return anchors;
}

/** One of the computers the board is scaled against. */
export interface PinnedOpponent {
  readonly difficulty: string;
  readonly rating: number;
  readonly version: number;
}

/**
 * The computers a leaderboard is measured against, strongest first.
 *
 * **The newest release on every rung, and nothing else.** Three rows rather than
 * one because the rungs are what give the scale points a person can place
 * themselves between — who has passed a kitchen table, who has passed the club,
 * who has passed the best it plays. One row would say only whether you are above
 * or below 1400.
 *
 * Superseded releases are left off even though they are still selectable, which
 * is the one thing here worth arguing about: somebody who plays v2 is being
 * measured against 1200 and will not find that number on the board. A board is a
 * scale rather than a catalogue, and every release on every rung is nine rows of
 * reference data in a list that will hold a handful of people. The difficulty row
 * in Settings is where the rest of the table lives.
 */
export function pinnedOpponents(): readonly PinnedOpponent[] {
  const version = Math.max(...Object.keys(BOT_RATINGS).map(Number));
  return Object.keys(DIFFICULTY_OFFSETS)
    .map((difficulty) => ({ difficulty, rating: botRating(version, difficulty), version }))
    .sort((a, b) => b.rating - a.rating);
}

/** The share of a match the first player is expected to take, from the gap alone. */
export function expectedScore(rating: number, against: number): number {
  return 1 / (1 + 10 ** ((against - rating) / 400));
}

interface RatingRow {
  readonly account0: string | null;
  readonly account1: string | null;
  readonly bot_version: number | null;
  readonly difficulty: string | null;
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
  // Duplicate sessions are recorded and are deliberately left out of the walk.
  //
  // Not because they could not be rated — the computer plays them, so there is
  // something to anchor to — but because the anchor cannot come from a bench. A
  // bench plays bot against bot, where *neither* side has cross-deal memory, and
  // a person does; so a bench measurement of the bot's duplicate strength
  // describes a game nobody is playing, and it is wrong in the direction nobody
  // notices, over-crediting the player. The bench can give the spread between
  // releases and rungs, since both sides there are equally memoryless; the single
  // invented number waits for played sessions.
  //
  // Rating a session against the *rubber* anchor in the meantime would be worse
  // than not rating it, for the reason this whole file exists: a figure that looks
  // authoritative and is not is the error that never gets corrected. Duplicate
  // matches still appear on the record screen, where `recordsFor` already keeps
  // one record per format.
  const rows = await env.DB.prepare(
    `SELECT account0, account1, bot_version, difficulty, token0, token1, winner
     FROM results
      WHERE format != 'duplicate' AND coalesce(repeated, 0) = 0
      ORDER BY finished_at`,
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
        ? botRating(row.bot_version, row.difficulty)
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
      // How many *this identity* has played, not how many the pool has, so a
      // newcomer to an established pool still gets their own settling period.
      const after = before[index] + stepFor(played.get(id) ?? 0) * (scored - expected);
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
