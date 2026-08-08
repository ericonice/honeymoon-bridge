-- Which computer opponent a robot rubber was played against.
--
-- A record against "the computer" is a record against whichever computer it
-- happened to be, and the bot has changed enough between versions that pooling
-- them describes an opponent nobody ever played. Versions are numbered from one
-- and named after hockey players in alphabetical order, so that a list of them
-- reads in the order they existed; the name lives in the client, since the
-- number is the only part a record needs.
--
-- Null for every row written before this column, and it cannot be filled in
-- afterwards: nothing recorded which bot those games were against. Null means
-- "before versions", not "unknown version".

ALTER TABLE results ADD COLUMN bot_version INTEGER;
