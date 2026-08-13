-- Achievement progress, per account.
--
-- `achievement_unlocks` is the badge list: one row per family/tier an account
-- has reached, written once and never removed. The one-shot families (Slam,
-- The Insult, The Axe, Take the Rubber, Down But Not Out, Nobody Wanted It,
-- Two-Suiter) write here directly. `achievement_counters` holds only the
-- handful of running lifetime counts the remaining, count-backed families are
-- compared against thresholds with (rejections, rubbers played, hands played/
-- won/lost) — a generic key/count pair rather than one column per counter, so
-- a future counter-backed family needs no schema change.
--
-- Anonymous play earns nothing: both tables key on `account_id`, and there is
-- deliberately no token-keyed fallback the way `results` has one, since a
-- browser rather than a person is not who an achievement is for.

CREATE TABLE achievement_unlocks (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  achievement TEXT NOT NULL,
  tier TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, achievement, tier)
);
CREATE INDEX achievement_unlocks_by_account ON achievement_unlocks(account_id);

CREATE TABLE achievement_counters (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, key)
);
