import { dealUnlocks, rubberUnlocks, unlockKey } from "@hb/engine";
import type {
  AchievementId,
  AchievementProgress,
  AchievementUpdate,
  CounterKey,
  DealFacts,
  PlayerId,
  RubberFacts,
  Tier,
  Unlock,
} from "@hb/engine";
import type { Env } from "./env.js";

/** Everything an account has unlocked, and where its running counters stand. */
export interface AchievementSnapshot {
  readonly counters: Partial<Record<CounterKey, number>>;
  readonly unlocked: readonly Unlock[];
}

/** The badge list and running counters for one account, for the Achievements screen. */
export async function achievementsFor(env: Env, accountId: string): Promise<AchievementSnapshot> {
  const [unlocks, counters] = await Promise.all([
    env.DB.prepare("SELECT achievement, tier FROM achievement_unlocks WHERE account_id = ?")
      .bind(accountId)
      .all<{ achievement: AchievementId; tier: Tier }>(),
    env.DB.prepare("SELECT key, count FROM achievement_counters WHERE account_id = ?")
      .bind(accountId)
      .all<{ key: CounterKey; count: number }>(),
  ]);

  const counts: Partial<Record<CounterKey, number>> = {};
  for (const row of counters.results) {
    counts[row.key] = row.count;
  }

  return {
    counters: counts,
    unlocked: unlocks.results.map((row) => ({ achievement: row.achievement, tier: row.tier })),
  };
}

/** `achievementsFor`, reshaped into what `dealUnlocks`/`rubberUnlocks` take as input. */
async function progressFor(env: Env, accountId: string): Promise<AchievementProgress> {
  const snapshot = await achievementsFor(env, accountId);
  return {
    counters: snapshot.counters,
    unlocked: new Set(snapshot.unlocked.map(unlockKey)),
  };
}

/**
 * Writes an update decided by `dealUnlocks`/`rubberUnlocks`: new counter
 * values and, for each newly-unlocked achievement, a row in
 * `achievement_unlocks`. `INSERT OR IGNORE` there is a second dedup on top of
 * the one those functions already did against `progressFor`'s read — cheap
 * insurance against a read and a write racing, which a single request here
 * never does, but costs nothing to keep true regardless.
 */
async function persist(env: Env, accountId: string, update: AchievementUpdate, now: number): Promise<void> {
  for (const key of Object.keys(update.counters) as CounterKey[]) {
    await env.DB.prepare(
      `INSERT INTO achievement_counters (account_id, key, count) VALUES (?, ?, ?)
       ON CONFLICT (account_id, key) DO UPDATE SET count = excluded.count`,
    )
      .bind(accountId, key, update.counters[key])
      .run();
  }
  for (const unlock of update.unlocked) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO achievement_unlocks (account_id, achievement, tier, unlocked_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(accountId, unlock.achievement, unlock.tier, now)
      .run();
  }
}

/**
 * Everything one deal just unlocked for one player, given the facts computed
 * by `@hb/engine`'s `dealFacts`. A no-op for anonymous play — an achievement
 * attaches to an account, never to a device, since §3.7 requires one to play
 * at all.
 */
export async function applyDealAchievements(
  env: Env,
  accountId: string | null,
  facts: DealFacts,
  player: PlayerId,
  now: number,
): Promise<readonly Unlock[]> {
  if (accountId === null) {
    return [];
  }
  const update = dealUnlocks(await progressFor(env, accountId), facts, player);
  await persist(env, accountId, update, now);
  return update.unlocked;
}

/**
 * Everything one rubber just unlocked for one player, the instant it
 * completes. `facts.wonRubber` is null until then, so nothing here ever fires
 * early.
 */
export async function applyRubberAchievements(
  env: Env,
  accountId: string | null,
  facts: RubberFacts,
  player: PlayerId,
  now: number,
): Promise<readonly Unlock[]> {
  if (accountId === null || facts.wonRubber === null) {
    return [];
  }
  const update = rubberUnlocks(await progressFor(env, accountId), facts, player);
  await persist(env, accountId, update, now);
  return update.unlocked;
}
