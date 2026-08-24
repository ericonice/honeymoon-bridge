-- Which difficulty rung a robot match was played against.
--
-- `bot_version` says *which* computer somebody played; this says how hard it was
-- asked to play. Both are needed to rate a result, because beating the computer
-- on its gentlest setting and beating it on its hardest are not the same
-- achievement — and `ratings.ts` pins an anchor per opponent, so an opponent that
-- is really four opponents needs four anchors.
--
-- Without this the ladder would repeat a mistake this schema already made once:
-- `bot_version` was added after v1 had been played, so those rows are null
-- forever and nothing can recover which bot they faced. Adding the column before
-- anybody plays on a rung is the whole point of doing it now.
--
-- Nullable, and null means "before difficulty existed" rather than "unknown". A
-- client too old to send one is not an error — the service worker keeps old
-- builds in circulation, and a match somebody played is worth recording whether
-- or not their app knew the question. `ratings.ts` reads null as the hardest
-- rung, since that is what every match before this column was played against.
ALTER TABLE results ADD COLUMN difficulty TEXT;

CREATE INDEX results_by_difficulty ON results(difficulty);
