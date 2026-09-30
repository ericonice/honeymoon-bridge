-- Two table results were filed naming the wrong seat as declarer, and one twice.
--
-- `#applyField` read `points` and `tricks` from each seat's own side and filed the
-- contract as it stood, so a *second-seat* result entered the corpus naming seat 1
-- as declarer beside tricks that said seat 0 — see `contractForSeat`, which fixes it
-- going forward. Solo play never showed it, because there the person is seat 0 and
-- turning round is the identity.
--
-- Found by auditing every recorded result against what its board's own terms say the
-- contract and tricks should be worth: 15,986 of 15,989 came out at 0, ±100 or ±150,
-- which is what honors can pay and nothing else can. The three that did not were all
-- table results on a second-stream board, and turning the declarer round takes each
-- of them to exactly zero. The two boards are named rather than the condition
-- described, because each row was checked on its own.
UPDATE field_results
   SET declarer = 1 - declarer
 WHERE generated = 0
   AND opponent_account_id IS NOT NULL
   AND declarer IS NOT NULL
   AND board_id IN ('f4023757-1', 'f4031676-1');

-- And the same deal was filed twice for one account. `recordFieldResult` drops a
-- result already recorded for an account on a board, so this is a slip rather than
-- the ordinary path — but a duplicate entry is counted twice by the matchpoints, so
-- it quietly weights one player's result double on that board.
--
-- Keeps the earliest of each (board, account) and drops the rest, which is
-- deterministic and describes the rule rather than the one row that broke it.
DELETE FROM field_results
 WHERE id IN (
   SELECT later.id
     FROM field_results AS later
    WHERE later.generated = 0
      AND EXISTS (
        SELECT 1
          FROM field_results AS first
         WHERE first.board_id = later.board_id
           AND first.account_id = later.account_id
           AND first.generated = 0
           AND first.id < later.id
      )
 );
