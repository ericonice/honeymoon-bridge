-- Which kind of match a result was: a rubber, or a single game to 100.
--
-- Kept because they are not the same achievement. A rubber is best of three and
-- runs the better part of an hour; a game is over the moment somebody reaches a
-- hundred below the line. A record that added them together would read as one
-- number meaning two things.
--
-- Existing rows are rubbers: that was the only kind of match that existed when
-- they were written.

ALTER TABLE results ADD COLUMN format TEXT NOT NULL DEFAULT 'rubber';
