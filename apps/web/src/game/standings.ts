import { useEffect, useState } from "react";
import { storedSession } from "./account.js";
import { standingsUrl } from "./serverUrl.js";

/**
 * Where everybody stands — the one view here that is not about the reader.
 *
 * Kept out of `records.ts` for the same reason it is a route of its own on the
 * server: everything in there answers "how did *you* do" and carries a
 * `pointsFor`, and a board has no asker. The only part of it belonging to the
 * reader is which row is marked `you`.
 */

/** One line of the board: a person, or one of the computers it is scaled against. */
export interface Standing {
  /** Which rung a computer row is pinned at. Null on a person's row. */
  readonly difficulty: string | null;
  /** Null on a computer row, which this app names for itself — see `standingName`. */
  readonly name: string | null;
  /** Rated matches behind the number. Null for a computer, whose rating is pinned. */
  readonly played: number | null;
  /** Null for a computer, and null while a rating is still settling. */
  readonly rank: number | null;
  readonly rating: number;
  /** Which release a computer row is. Null on a person's row. */
  readonly version: number | null;
  readonly you: boolean;
}

export interface Standings {
  /** How many people are ranked, which `ranked` may be capped below. */
  readonly of: number;
  readonly ranked: readonly Standing[];
  /** After how many matches a rating is ranked. Sent so this is not a second copy. */
  readonly settledAfter: number;
  readonly settling: readonly Standing[];
}

export interface StandingsState {
  readonly loading: boolean;
  readonly standings: Standings | null;
}

/**
 * The board, fetched the first time somebody actually looks at it.
 *
 * **Lazily on purpose.** It shares a screen with the record, and the record is
 * what people open — somebody checking their own win-loss should not pay for a
 * global rating walk and everybody else's rows. Fetched once per visit and then
 * held, since the state lives on the screen: switching back and forth costs
 * nothing, and leaving and returning gets a fresh answer.
 *
 * Null covers signed out, offline and refused alike, which is the same thing this
 * screen already does with a record it could not load: none of the three is a
 * story worth telling here.
 */
export function useStandings(active: boolean): StandingsState {
  const [standings, setStandings] = useState<Standings | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const session = storedSession();
    if (!active || session === null || standings !== null) {
      return;
    }

    let live = true;
    setLoading(true);
    void fetch(standingsUrl(), { headers: { Authorization: `Bearer ${session}` } })
      .then(async (response) => (response.ok ? ((await response.json()) as Standings) : null))
      .then((fetched) => {
        if (live) {
          setStandings(fetched);
        }
      })
      .catch(() => {
        if (live) {
          setStandings(null);
        }
      })
      .finally(() => {
        if (live) {
          setLoading(false);
        }
      });

    return () => {
      live = false;
    };
  }, [active, standings]);

  return { loading, standings };
}
