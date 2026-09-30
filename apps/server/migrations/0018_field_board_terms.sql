-- A board dealt from the second end had its two seats' terms the wrong way round.
--
-- §1.8a prescribes vulnerability per board so every result on it was made on the
-- same terms, and the cycle is read against the stock's two *streams*. A stock makes
-- two boards, one dealt from either end — and the generator wrote a single pair
-- against both, so on the board whose starter is 1, where the person draws second
-- and holds the second stream, the two seats were handed each other's terms. The
-- results recorded there were made on terms nobody playing it afterwards was given:
-- reported from real play as the same 4H +2 reading -480 on the row a person played
-- and -680 on every recorded one beside it, which is the game bonus at one
-- vulnerability against the other.
--
-- Only the board rows are wrong. Every generated result was scored against the
-- stream that actually made it, so swapping the board back to agree with them is the
-- whole repair -- and it is what makes the boards that have not been dealt yet
-- correct for everybody, including clients the service worker keeps in circulation.
--
-- **Not idempotent**, unlike most of the repairs in here: running it twice puts the
-- fault back. It is a migration rather than a read-time fix for exactly that reason,
-- since `wrangler d1 migrations apply` runs it once and records that it did.
--
-- Half the cycle gives both streams the same answer, so only half of the affected
-- boards actually change, which is the kind of bug that hides.
UPDATE field_boards
   SET vulnerable_0 = vulnerable_1,
       vulnerable_1 = vulnerable_0
 WHERE starter = 1;
