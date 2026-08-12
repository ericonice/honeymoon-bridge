import type { MatchFormat } from "@hb/engine";
import { useCallback, useEffect, useState } from "react";
import { storedSession } from "./account.js";
import { nickname, playerToken } from "./identity.js";
import { recentMatchesUrl, recordsUrl, resetRecordUrl, robotResultUrl } from "./serverUrl.js";

/** A record against one opponent. The computer's looks exactly like a person's. */
export interface OpponentRecord {
  readonly deals: number;
  readonly format: MatchFormat;
  readonly lastPlayed: number;
  readonly lost: number;
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
  readonly won: number;
}

export interface Records {
  readonly opponents: readonly OpponentRecord[];
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
 * claiming a token is for. Failure is swallowed: this is a record of a game that
 * has already been played and enjoyed, and it must never interrupt one.
 */
export async function reportRobotRubber(rubber: RobotRubber): Promise<void> {
  const session = storedSession();
  try {
    await fetch(robotResultUrl(), {
      body: JSON.stringify({
        botVersion: rubber.botVersion,
        deals: rubber.deals,
        deviceToken: playerToken(),
        format: rubber.format,
        nickname: nickname() === "" ? "Player" : nickname(),
        points: rubber.points,
        pointsAgainst: rubber.pointsAgainst,
        won: rubber.won,
      }),
      headers: {
        "Content-Type": "application/json",
        ...(session === null ? {} : { Authorization: `Bearer ${session}` }),
      },
      method: "POST",
    });
  } catch {
    // Offline, most likely — the robot game is meant to work with no network at
    // all, so this is an expected outcome rather than a fault.
  }
}

/**
 * Forgets this account's record, and returns how many matches it let go of.
 *
 * Games against people are not deleted, only detached from this account — they
 * are one row shared with somebody who also played them, and taking a match off
 * their record is not this button's to do.
 */
export async function resetRecord(): Promise<number | null> {
  const session = storedSession();
  if (session === null) {
    return null;
  }
  const response = await fetch(resetRecordUrl(), {
    headers: { Authorization: `Bearer ${session}` },
    method: "POST",
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { forgotten: number };
  return body.forgotten;
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

    setLoading(true);
    void fetch(recordsUrl(), { headers: { Authorization: `Bearer ${session}` } })
      .then(async (response) => (response.ok ? ((await response.json()) as Records) : null))
      .then(setRecords)
      .catch(() => {
        setRecords(null);
      })
      .finally(() => {
        setLoading(false);
      });
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
    void fetch(recentMatchesUrl(), { headers: { Authorization: `Bearer ${session}` } })
      .then(async (response) =>
        response.ok ? ((await response.json()) as { matches: MatchRecord[] }).matches : null,
      )
      .then(setMatches)
      .catch(() => {
        setMatches(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [active]);

  return { loading, matches };
}
