import type { MatchFormat } from "@hb/engine";
import { useCallback, useEffect, useState } from "react";
import { storedSession } from "./account.js";
import { nickname, playerToken } from "./identity.js";
import { enqueue, flush, outboxState } from "./outbox.js";
import { readStored, writeStored } from "./storage.js";
import { recentMatchesUrl, recordsUrl, resetRecordUrl, robotResultUrl } from "./serverUrl.js";

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
    readonly value: number;
  };
  readonly robot: readonly OpponentRecord[];
}

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
    JSON.stringify({ bot, mine: records.rating?.value ?? STARTING_RATING }),
  );
}

export interface KnownRatings {
  /** Null until a record has been fetched that had a robot row in it. */
  readonly bot: number | null;
  readonly mine: number | null;
}

export function knownRatings(): KnownRatings {
  const raw = readStored(RATING_KEY);
  if (raw === null) {
    return { bot: null, mine: null };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<KnownRatings>;
    return { bot: parsed.bot ?? null, mine: parsed.mine ?? null };
  } catch {
    return { bot: null, mine: null };
  }
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
