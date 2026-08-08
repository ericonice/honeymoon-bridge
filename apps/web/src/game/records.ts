import type { MatchFormat } from "@hb/engine";
import { useCallback, useEffect, useState } from "react";
import { storedSession } from "./account.js";
import { nickname, playerToken } from "./identity.js";
import { recordsUrl, robotResultUrl } from "./serverUrl.js";

/** A record against one opponent. The computer's looks exactly like a person's. */
export interface OpponentRecord {
  readonly deals: number;
  readonly format: MatchFormat;
  readonly lastPlayed: number;
  readonly lost: number;
  readonly name: string;
  readonly pointsAgainst: number;
  readonly pointsFor: number;
  readonly won: number;
}

export interface Records {
  readonly opponents: readonly OpponentRecord[];
  readonly robot: readonly OpponentRecord[];
}

export interface RobotRubber {
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
