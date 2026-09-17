-- A board's number in the pool — §1.8a.
--
-- The order boards are offered in was carried by `created_at`, which is a timestamp
-- being asked to mean a sequence. It did the job only because the generator was
-- careful to stamp each row a millisecond apart, and it said nothing to anybody
-- reading the table. A number says what it is.
--
-- **Both sides of a stock share a number**, because a board *is* a stock and the two
-- streams are that board from either end. That is duplicate's own convention — a club
-- calls the thing on the table board twelve whichever direction you are sitting.
--
-- Nullable, because rows written before this column existed have to read back
-- somehow; every one of them is renumbered on the spot by the statement the generator
-- prints, which assigns numbers in seed order across the whole table and is
-- idempotent. Nothing here depends on when a board was made any more.
ALTER TABLE field_boards ADD COLUMN number INTEGER;

CREATE INDEX field_boards_by_number ON field_boards(number);
