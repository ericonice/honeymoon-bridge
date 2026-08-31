-- Whether this account asked not to appear on the public leaderboard by name.
--
-- Nullable, and null/0 means "not hidden" — every row written before this column
-- existed was shown on the leaderboard, because there was no way to have asked
-- otherwise. Same reading as `bot_version`'s null and `repeated`'s null: the
-- conservative default is the one that changes nothing for an account that never
-- touched the setting.
ALTER TABLE accounts ADD COLUMN hide_from_leaderboard INTEGER;
