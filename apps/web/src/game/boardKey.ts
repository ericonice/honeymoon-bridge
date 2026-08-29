import { currentDeal } from "@hb/engine";
import type { MatchState } from "@hb/engine";

/**
 * What identifies the board on the table, for the computer's memory of it.
 *
 * The deal's own seed, in both formats, because that is what a board *is* — and
 * because keying on it gives the one behaviour wanted for free: a board's second
 * run carries the same seed as its first, so `boardOffers` keeps the record of the
 * first run and the replay does not overwrite it with a record of the half already
 * spent.
 *
 * **Both formats is the whole point of it, and for a while only one of them called
 * it.** `localSession`'s recording was gated on the match being a duplicate session, so a
 * mirror and a return match — the two other places a board comes round — handed the
 * bot an empty memory on every deal, while `bench/rubber.ts` kept a copy of this
 * same expression and measured a bot with the memory on. A bench and an app
 * disagreeing about what the computer knows is worse than either answer.
 *
 * A plain rubber deals every seed once, so nothing is ever recognised and this
 * costs only a lookup — which is exactly what should happen there.
 *
 * Its own module rather than a private function, because the app, `bench/rubber.ts`
 * and the test all have to agree about what a board is, and the bench kept a copy of
 * this expression with a comment saying the two had to agree. They did not.
 *
 * Null before anything has been dealt, which cannot happen, and is handled rather
 * than asserted because the alternative is a crash on the first draw turn.
 */
export function boardKeyOf(match: MatchState): number | null {
  if (match.kind === "duplicate") {
    return match.session.boards[currentDeal(match.session).board]?.seed ?? null;
  }
  return match.table.dealt[match.table.dealt.length - 1]?.seed ?? null;
}
