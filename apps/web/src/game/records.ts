import type { MatchFormat } from "@hb/engine";
import { useCallback, useEffect, useState } from "react";
import type { Difficulty } from "../bot/difficulty.js";
import { storedSession } from "./account.js";
import { nickname, playerToken } from "./identity.js";
import { enqueue, flush, outboxState } from "./outbox.js";
import { readStored, writeStored } from "./storage.js";
import {
  botsUrl,
  everyMatchUrl,
  recentMatchesUrl,
  recordsUrl,
  resetRecordUrl,
  robotResultUrl,
} from "./serverUrl.js";

/**
 * One finished match against one opponent, as their own row shows it.
 *
 * Who and which format are fixed by the `OpponentRecord` this hangs off, so
 * neither is repeated per match.
 */
export interface OpponentMatch {
  readonly botVersion: number | null;
  readonly deals: number;
  readonly finishedAt: number;
  readonly pointsAgainst: number;
  readonly pointsFor: number;
  readonly won: boolean;
}

/** One point of the rating line: what it became, and who it was against. */
export interface RatingPoint {
  /** The bot faced, or null for a person — what marks where the opponent changed. */
  readonly botVersion: number | null;
  readonly rating: number;
}

/** A record against one opponent. The computer's looks exactly like a person's. */
export interface OpponentRecord {
  readonly deals: number;
  readonly format: MatchFormat;
  readonly lastPlayed: number;
  readonly lost: number;
  /**
   * The newest matches against them, newest first, capped server-side.
   *
   * Possibly empty from a server too old to send them, which is why nothing here
   * treats its length as the number of matches played — `won + lost` is that, and
   * the difference is what the panel admits to not showing.
   */
  readonly matches: readonly OpponentMatch[];
  readonly name: string;
  /**
   * Groups this row with the same opponent's row in the other format. Not
   * their account id or device token — see `assignOpponentKeys` on the
   * server — just enough to tell whether two rows are the same opponent
   * without saying who that opponent is beyond a display name that could
   * coincidentally collide with somebody else's.
   */
  readonly opponentKey: string;
  readonly pointsAgainst: number;
  readonly pointsFor: number;
  /** What this opponent is rated. The computer's is pinned; see the server's `ratings.ts`. */
  readonly rating: number;
  readonly won: number;
}

export interface Records {
  /** See `BotAnchors`. Absent from a server too old to send it. */
  readonly anchors?: BotAnchors;
  readonly opponents: readonly OpponentRecord[];
  /**
   * The asker's own rating.
   *
   * Defaulted rather than optional, because an older server does not send it and a
   * screen that has to ask "is there a rating" everywhere reads worse than one that
   * shows the starting value — which is the truthful answer for somebody with no
   * rated matches anyway.
   */
  readonly rating: {
    /** Oldest first, capped server-side — one point per rated match. */
    readonly history: readonly RatingPoint[];
    readonly played: number;
    /** What the next result moves them by — see the server's `Records`. */
    readonly step?: number;
    readonly value: number;
  };
  readonly robot: readonly OpponentRecord[];
}

/**
 * What the computer is worth on each rung, by release — `version` then rung.
 *
 * The server sends this rather than the client computing it, so the number on the
 * difficulty row, the number beside the opponent's seat and the number the rating
 * walk actually used cannot drift apart. Empty from a server too old to send it,
 * which reads as "nothing to show" rather than as an error.
 */
export type BotAnchors = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** One finished match, newest first — what `OpponentRecord` tallies away. */
export interface MatchRecord {
  readonly botVersion: number | null;
  readonly deals: number;
  readonly finishedAt: number;
  readonly format: MatchFormat;
  readonly opponentName: string;
  readonly pointsAgainst: number;
  readonly pointsFor: number;
  readonly won: boolean;
}

export interface RobotRubber {
  /** Which computer opponent this was. See `bot/release.ts`. */
  readonly botVersion: number;
  readonly deals: number;
  /**
   * Which rung it was set to play at. The release says *which* computer; this
   * says how hard, and the server rates the two together — beating it on its
   * gentlest setting and beating it on its hardest are not one achievement.
   */
  readonly difficulty: Difficulty;
  readonly format: MatchFormat;
  readonly points: number;
  readonly pointsAgainst: number;
  readonly won: boolean;
}

/**
 * Tells the server about a rubber won or lost against the computer.
 *
 * The device token goes along whether or not anybody is signed in, so a rubber
 * played before signing up is attached to the account later — that is what
 * claiming a token is for.
 *
 * **Queued rather than sent, because a rubber that happened must not depend on
 * the network being up at the moment it ended.** This used to be one
 * fire-and-forget POST whose failure was swallowed on purpose, and that lost
 * rubbers two different ways: a dropped connection lost one silently, and so did
 * a rejected body, since nothing looked at the response. The end of a rubber is
 * also exactly when somebody puts the phone down, which is the worst possible
 * moment for a request with no `keepalive` and no second chance. `outbox.ts` has
 * the details.
 */
export function reportRobotRubber(rubber: RobotRubber): void {
  enqueue({
    body: JSON.stringify({
      botVersion: rubber.botVersion,
      deals: rubber.deals,
      deviceToken: playerToken(),
      difficulty: rubber.difficulty,
      // Stamped here rather than on arrival. A queued report can be days late,
      // and a rating that walks the history in order needs the order to be when
      // the games were played.
      finishedAt: Date.now(),
      format: rubber.format,
      nickname: nickname() === "" ? "Player" : nickname(),
      points: rubber.points,
      pointsAgainst: rubber.pointsAgainst,
      won: rubber.won,
    }),
    kind: rubber.won ? "Rubber won" : "Rubber lost",
    url: robotResultUrl(),
    // The device token identifies it without one, which is what lets a rubber
    // played before signing up still be claimed later.
    withSession: false,
  });
}

/**
 * Forgets this account's record, and returns how many matches it let go of.
 *
 * Games against people are not deleted, only detached from this account — they
 * are one row shared with somebody who also played them, and taking a match off
 * their record is not this button's to do.
 */
export async function resetRecord({
  achievements,
}: {
  /** Whether the titles and counts go with the matches. Asked, never assumed. */
  readonly achievements: boolean;
}): Promise<number | null> {
  const session = storedSession();
  if (session === null) {
    return null;
  }
  const response = await fetch(resetRecordUrl(), {
    body: JSON.stringify({ achievements }),
    headers: { Authorization: `Bearer ${session}`, "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { forgotten: number };
  return body.forgotten;
}

/** A server too old to rate anybody still has a usable record. */
function withRating(records: Records): Records {
  if (records.rating === undefined) {
    return { ...records, rating: { history: [], played: 0, value: STARTING_RATING } };
  }
  // A server new enough to rate but not to draw the line sends no history, and the
  // chart's own minimum then hides itself — which is the right outcome either way.
  return { ...records, rating: { ...records.rating, history: records.rating.history ?? [] } };
}

/** What a new player is rated, mirrored from the server's `START_RATING`. */
export const STARTING_RATING = 1500;

const RATING_KEY = "hb.ratings";

/**
 * The last ratings seen, so the board can show them without a request.
 *
 * The play screen must work with no network at all — that is the whole shape of the
 * robot game — so it reads the number the record screen last fetched rather than
 * fetching one itself. Stale by exactly one visit to the record, which for a figure
 * that only changes when a match ends is no staleness at all.
 */
export function rememberRatings(records: Records | null): void {
  if (records === null) {
    return;
  }
  const bot = records.robot[0]?.rating ?? null;
  writeStored(
    RATING_KEY,
    JSON.stringify({
      anchors: records.anchors ?? {},
      bot,
      mine: records.rating?.value ?? STARTING_RATING,
      step: records.rating?.step ?? null,
    }),
  );
}

export interface KnownRatings {
  /** Every release on every rung, as the server last reported them. */
  readonly anchors: BotAnchors;
  /**
   * What the computer was rated in the most recent match on record.
   *
   * Kept for a server too old to send `anchors`, and only for that: it describes
   * whichever rung was played last rather than the one selected now, so anything
   * that knows which rung it is asking about should use `botAnchor` instead.
   */
  readonly bot: number | null;
  readonly mine: number | null;
  /**
   * What the next result will move this player by, as the server last said.
   *
   * Null from a server too old to send it, which has to mean "cannot say" rather
   * than a default — the provisional period doubles it for a new player, so
   * guessing the settled value would understate exactly the change most worth
   * showing.
   */
  readonly step: number | null;
}

export function knownRatings(): KnownRatings {
  const empty: KnownRatings = { anchors: {}, bot: null, mine: null, step: null };
  const raw = readStored(RATING_KEY);
  if (raw === null) {
    return empty;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<KnownRatings>;
    return {
      anchors: parsed.anchors ?? {},
      bot: parsed.bot ?? null,
      mine: parsed.mine ?? null,
      step: parsed.step ?? null,
    };
  } catch {
    return empty;
  }
}

/**
 * What the computer is rated on one release and one rung, or null if nothing has
 * been fetched that says.
 *
 * Null rather than a guess on purpose. The alternative is for the client to keep
 * its own copy of the anchor table, which is the drift this exists to prevent —
 * and the ladder is provisional, so a stale local copy would be wrong in exactly
 * the way that matters. A screen with no number to show should say nothing.
 */
export function botAnchor(version: number, difficulty: Difficulty): number | null {
  const { anchors, bot } = knownRatings();
  return anchors[String(version)]?.[difficulty] ?? bot;
}

/**
 * What the computer is rated on this release and this rung, fetched if nothing
 * local says yet.
 *
 * The cached copy is read *synchronously* on the first render, so a device that
 * has ever seen these numbers draws them immediately and offline — which the
 * robot game requires, since it must work with no network at all. The request is
 * only for the case that has none: a fresh install, or a player who has never
 * opened the record screen.
 *
 * That was the bug this replaces. The anchors used to arrive only with the
 * record, so the rating beside the opponent's seat depended on having visited a
 * different screen while signed in — and showed nothing until you did. A number
 * whose whole job is to sit beside the opponent while you play them should not
 * be reachable only from somewhere else.
 *
 * Still null rather than a guess when the fetch fails and nothing is cached. A
 * rating is the figure somebody quotes at the dinner table, so a plausible wrong
 * one is worse than a blank: nobody checks a number that looks right.
 */
export function useBotAnchor(version: number, difficulty: Difficulty): number | null {
  const [anchor, setAnchor] = useState(() => botAnchor(version, difficulty));

  useEffect(() => {
    if (anchor !== null) {
      return;
    }
    let live = true;
    void fetch(botsUrl())
      .then(async (response) => (response.ok ? ((await response.json()) as { anchors?: BotAnchors }) : null))
      .then((body) => {
        if (!live || body?.anchors === undefined) {
          return;
        }
        rememberAnchors(body.anchors);
        setAnchor(botAnchor(version, difficulty));
      })
      .catch(() => {
        // No network, or no server. The blank is the honest answer.
      });
    return () => {
      live = false;
    };
  }, [anchor, difficulty, version]);

  return anchor;
}

/** Stores anchors without disturbing the two ratings cached alongside them. */
export function rememberAnchors(anchors: BotAnchors): void {
  const known = knownRatings();
  writeStored(
    RATING_KEY,
    JSON.stringify({ anchors, bot: known.bot, mine: known.mine, step: known.step }),
  );
}

/** One seat of a finished match, as it was recorded. */
export interface MatchSeat {
  readonly name: string;
  readonly points: number;
  readonly robot: boolean;
}

/**
 * A finished match with no point of view — two seats and a winner.
 *
 * Every other shape here answers "how did *you* do" and reports a `pointsFor`.
 * A list of games other people played has no asker, so it cannot have a side.
 */
export interface AnyMatch {
  readonly botVersion: number | null;
  readonly deals: number;
  readonly difficulty: string | null;
  readonly finishedAt: number;
  readonly format: MatchFormat;
  readonly players: readonly [MatchSeat, MatchSeat];
  readonly winner: 0 | 1;
}

/**
 * Every recent match by anybody, or null on anything short of a real answer.
 *
 * Null covers signed out, not a playtester, and offline alike — the server
 * answers 404 rather than 401 to anyone not on the list, so this cannot tell
 * "you may not" from "there is nothing", and should not pretend to.
 */
export async function fetchEveryMatch(limit = 50): Promise<AnyMatch[] | null> {
  const session = storedSession();
  if (session === null) {
    return null;
  }
  try {
    const response = await fetch(`${everyMatchUrl()}?limit=${limit}`, {
      headers: { Authorization: `Bearer ${session}` },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { matches: AnyMatch[] };
    return body.matches;
  } catch {
    return null;
  }
}

/**
 * What a finished match did to your rating.
 *
 * **A rating is the one thing on the final score screen that is not about this
 * match** — it is what the match was *for*, and the only moment it means
 * anything is the moment it moves. During a rubber it is inert reference data;
 * here it is the result.
 *
 * Computed rather than waited for, and the two agree by construction: this is
 * the same arithmetic the server's walk does, handed the same step. The server
 * remains authoritative — the next record fetch overwrites this — so the worst
 * case is a number that is briefly right for a few seconds before being
 * confirmed, rather than one that can drift.
 *
 * Null whenever any part is unknown: no rating cached, no anchor for this
 * opponent, or a server too old to say what the next step is. A rating change is
 * a claim about a specific number, and a guessed one is worse than none.
 */
export function ratingChange(options: {
  readonly opponent: number | null;
  readonly won: boolean;
}): { readonly after: number; readonly before: number; readonly delta: number } | null {
  const { bot: _bot, mine, step } = knownRatings();
  const { opponent, won } = options;
  if (mine === null || opponent === null || step === null) {
    return null;
  }
  // Elo's own expectation. Duplicated from the server rather than sent, because
  // it is the definition of the scale rather than a choice anybody made — where
  // `step` is a choice, and is therefore sent.
  const expected = 1 / (1 + 10 ** ((opponent - mine) / 400));
  const after = mine + step * ((won ? 1 : 0) - expected);
  return { after: Math.round(after), before: Math.round(mine), delta: Math.round(after - mine) };
}

export interface RecordsState {
  readonly loading: boolean;
  readonly records: Records | null;
  reload(): void;
}

/**
 * The signed-in player's record, fetched when asked for.
 *
 * Null records mean nothing to show — either not signed in, or the server could
 * not be reached. The screen says the same thing in both cases, since neither is
 * a story worth telling in a settings panel.
 */
export function useRecords(active: boolean): RecordsState {
  const [records, setRecords] = useState<Records | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback((): void => {
    const session = storedSession();
    if (session === null) {
      setRecords(null);
      return;
    }

    // Read now, and read again once anything queued has landed.
    //
    // **Waiting for the send first was tried and was worse than the bug.** A
    // rubber's result is enqueued the moment the match ends, so asking the server
    // straight afterwards is a race the read usually wins and the answer is the
    // record from before the match. Blocking the read on `flush()` fixed that and
    // introduced something worse: `outbox.ts` awaits `fetch` with no timeout, so
    // one slow or hanging report held the whole screen — sometimes for a long
    // time, sometimes forever. A screen that never appears is a worse failure than
    // a screen showing yesterday's number.
    //
    // So the read never depends on the send. The second pass only happens when
    // there was something waiting, which is the case that needed it: after a match
    // rather than every time somebody opens the screen.
    const issued = { current: 0 };
    const load = (): Promise<void> => {
      const mine = (issued.current += 1);
      return fetch(recordsUrl(), { headers: { Authorization: `Bearer ${session}` } })
        .then(async (response) => (response.ok ? ((await response.json()) as Records) : null))
        .then((fetched) => {
          // A slower earlier read must not overwrite a later one.
          if (mine < issued.current) {
            return;
          }
          setRecords(fetched === null ? null : withRating(fetched));
          rememberRatings(fetched);
        })
        .catch(() => {
          if (mine === issued.current) {
            setRecords(null);
          }
        });
    };

    const pending = outboxState().waiting.length > 0;
    setLoading(true);
    void load().finally(() => {
      setLoading(false);
    });
    if (pending) {
      void flush()
        .catch(() => undefined)
        .then(() => load());
    }
  }, []);

  useEffect(() => {
    if (active) {
      reload();
    }
  }, [active, reload]);

  return { loading, records, reload };
}

export interface RecentMatchesState {
  readonly loading: boolean;
  readonly matches: readonly MatchRecord[] | null;
}

/** The signed-in player's most recent matches, individually, fetched when asked for. */
export function useRecentMatches(active: boolean): RecentMatchesState {
  const [matches, setMatches] = useState<readonly MatchRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const session = storedSession();
    if (!active || session === null) {
      setMatches(null);
      return;
    }

    setLoading(true);
    // The same shape as `useRecords`: read now, and again if something was queued.
    const load = (): Promise<void> =>
      fetch(recentMatchesUrl(), { headers: { Authorization: `Bearer ${session}` } })
        .then(async (response) =>
          response.ok ? ((await response.json()) as { matches: MatchRecord[] }).matches : null,
        )
        .then(setMatches)
        .catch(() => {
          setMatches(null);
        });

    const pending = outboxState().waiting.length > 0;
    void load().finally(() => {
      setLoading(false);
    });
    if (pending) {
      void flush()
        .catch(() => undefined)
        .then(() => load());
    }
  }, [active]);

  return { loading, matches };
}
