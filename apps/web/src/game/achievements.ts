import { dealUnlocks, rubberUnlocks, unlockKey } from "@hb/engine";
import type {
  AchievementProgress,
  AchievementUpdate,
  CounterKey,
  DealFacts,
  PlayerId,
  RubberFacts,
  Unlock,
} from "@hb/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { storedSession } from "./account.js";
import { achievementsUrl, dealAchievementsUrl, rubberAchievementsUrl } from "./serverUrl.js";

/** The badge list and running counters behind it, as the server sends them. */
export interface AchievementSnapshot {
  readonly counters: Partial<Record<CounterKey, number>>;
  readonly unlocked: readonly Unlock[];
}

const EMPTY_PROGRESS: AchievementProgress = { counters: {}, unlocked: new Set() };

function progressFrom(snapshot: AchievementSnapshot | null): AchievementProgress {
  return snapshot === null
    ? EMPTY_PROGRESS
    : { counters: snapshot.counters, unlocked: new Set(snapshot.unlocked.map(unlockKey)) };
}

/** The signed-in account's current progress, or null when signed out or unreachable. */
async function fetchAchievements(): Promise<AchievementSnapshot | null> {
  const session = storedSession();
  if (session === null) {
    return null;
  }
  try {
    const response = await fetch(achievementsUrl(), {
      headers: { Authorization: `Bearer ${session}` },
    });
    return response.ok ? ((await response.json()) as AchievementSnapshot) : null;
  } catch {
    return null;
  }
}

/**
 * Tells the server what one deal or rubber just meant for achievements.
 *
 * Fire-and-forget, exactly like `reportRobotRubber` — the robot game must work
 * with no network at all, so a failed report is dropped rather than queued or
 * retried. What was shown locally already stands; it simply will not have
 * persisted, which is the accepted cost of a notification that cannot wait on
 * a round trip.
 */
async function reportDeal(facts: DealFacts, player: PlayerId): Promise<void> {
  const session = storedSession();
  if (session === null) {
    return;
  }
  try {
    await fetch(dealAchievementsUrl(), {
      body: JSON.stringify({ facts, player }),
      headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
      method: "POST",
    });
  } catch {
    // Offline, most likely. See the note above.
  }
}

async function reportRubber(facts: RubberFacts, player: PlayerId): Promise<void> {
  const session = storedSession();
  if (session === null) {
    return;
  }
  try {
    await fetch(rubberAchievementsUrl(), {
      body: JSON.stringify({ facts, player }),
      headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
      method: "POST",
    });
  } catch {
    // Offline, most likely. See the note above.
  }
}

export interface AchievementsState {
  readonly loading: boolean;
  readonly snapshot: AchievementSnapshot | null;
  reload(): void;
}

/** The signed-in player's achievements, fetched when asked for — the Achievements screen's hook. */
export function useAchievements(active: boolean): AchievementsState {
  const [snapshot, setSnapshot] = useState<AchievementSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback((): void => {
    setLoading(true);
    void fetchAchievements()
      .then(setSnapshot)
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (active) {
      reload();
    }
  }, [active, reload]);

  return { loading, snapshot, reload };
}

export interface AchievementTracker {
  /** Achievements unlocked since the last `clear`, oldest first. */
  readonly justUnlocked: readonly Unlock[];
  clear(): void;
  /** Evaluates one just-completed deal for `player`, notifies, and reports it. */
  applyDeal(facts: DealFacts, player: PlayerId): void;
  /** Evaluates one just-completed rubber for `player`, notifies, and reports it. */
  applyRubber(facts: RubberFacts, player: PlayerId): void;
}

/**
 * Live, local achievement evaluation for the robot game.
 *
 * The robot game has no server in the loop while it is being played (§2.1),
 * so a notification that waited on `reportDeal`'s round trip would never show
 * at all when offline — which is most of the point of playing against the
 * computer. Instead this holds its own cached copy of the account's progress,
 * fetched once, and runs the exact same `dealUnlocks`/`rubberUnlocks` the
 * server runs — see `@hb/engine` — so the decision is instant and identical
 * either way. The report that follows is what makes it durable; the tracker
 * itself only ever makes it visible.
 */
export function useAchievementTracker(): AchievementTracker {
  const progress = useRef<AchievementProgress>(EMPTY_PROGRESS);
  const loaded = useRef(false);
  const [justUnlocked, setJustUnlocked] = useState<readonly Unlock[]>([]);

  useEffect(() => {
    if (loaded.current) {
      return;
    }
    loaded.current = true;
    void fetchAchievements().then((snapshot) => {
      progress.current = progressFrom(snapshot);
    });
  }, []);

  const absorb = useCallback((update: AchievementUpdate) => {
    progress.current = {
      counters: { ...progress.current.counters, ...update.counters },
      unlocked: new Set([...progress.current.unlocked, ...update.unlocked.map(unlockKey)]),
    };
    if (update.unlocked.length > 0) {
      setJustUnlocked((current) => [...current, ...update.unlocked]);
    }
  }, []);

  const applyDeal = useCallback(
    (facts: DealFacts, player: PlayerId) => {
      absorb(dealUnlocks(progress.current, facts, player));
      void reportDeal(facts, player);
    },
    [absorb],
  );

  const applyRubber = useCallback(
    (facts: RubberFacts, player: PlayerId) => {
      absorb(rubberUnlocks(progress.current, facts, player));
      void reportRubber(facts, player);
    },
    [absorb],
  );

  const clear = useCallback(() => {
    setJustUnlocked([]);
  }, []);

  return { applyDeal, applyRubber, clear, justUnlocked };
}
