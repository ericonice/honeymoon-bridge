import { finishedHandsFor } from "@hb/engine";
import type { AuctionEntry, Card, FieldBoard, Pair, PlayerId } from "@hb/engine";
import { useRef } from "react";
import type { GameSession } from "./session.js";

/**
 * A board you have finished, kept so it can be looked at again.
 *
 * Everything in here was on screen at the reveal and is public by then: both hands
 * were played face up to thirteen tricks, and the auction was made in the open. It
 * is kept rather than re-derived because nothing else keeps it — `FieldResult`
 * records what a board *came to*, and a seed reconstructs a stock rather than the
 * two hands thirteen keep-or-reject decisions each built out of it.
 *
 * **Deliberately not on the wire.** The tempting version hangs this off
 * `FieldResult`, which puts both hands inside `snapshotFor` and re-introduces the
 * conditional permission in `packages/protocol/test/snapshot.test.ts` that
 * withdrawing the open discard removed. This is what the client saw, held by the
 * client, so the projection keeps having no exceptions.
 *
 * **Discards are not in it**, and their absence is a rule rather than an oversight:
 * a player has seen the thirteen cards they threw and remembering them is part of
 * §1, which is why `PlayerView` omits them. A screen that handed them back would be
 * the back door to a decision taken at the front.
 */
export interface BoardReview {
  readonly auction: readonly AuctionEntry[];
  readonly hands: Pair<readonly Card[]>;
  readonly tricks: Pair<number>;
}

export type BoardReviews = ReadonlyMap<string, BoardReview>;

/**
 * What identifies one side of a stock, for a review to be filed and found under.
 *
 * The board's own id where there is one, which is what §1.8a ranks against. A seed
 * and a starter where there is not — solo play names only the seat the person
 * holds, so the other stream has no id, and a session played against a server too
 * old to have handed one over has none at all.
 *
 * One function rather than the expression written twice, for the reason `boardKeyOf`
 * exists: the copy that files a review and the copy that looks one up have to agree,
 * and a comment saying they do is not a mechanism.
 */
export function reviewKeyOf(board: FieldBoard, me: PlayerId): string {
  return board.ids[me] ?? `${board.seed}:${board.starter}`;
}

/**
 * Keeps every board of this sitting that can be looked back at.
 *
 * **Doop is the one format where this costs nothing**, and that is the rule rather
 * than a fact about this screen: a board here is played once, and `fieldBoardsFor`
 * excludes seeds met in earlier sessions, so nothing learnt from looking back can be
 * spent on a board still to come. In Replay, a mirror or a return match the same
 * facility would hand over the second run, so it is not offered there.
 *
 * Filed at the moment a board is complete, which is the only moment the hands exist
 * to be filed — the reveal shows them and the next deal replaces the state they came
 * from. `finishedHandsFor` is the whole of that test and is deliberately the only
 * one: it answers null for anything short of a full thirteen tricks, so a deal in
 * progress and a board finished by an accepted **claim** both come back with nothing
 * to keep. Guarding on the phase as well reads as belt and braces and is not — it is
 * a second condition that cannot fail independently, and a test aimed at it passes
 * whatever the code does.
 *
 * A ref written during render rather than state set in an effect, for the reason
 * `useShownPhase` gives: what is filed is a pure function of the render it is filed
 * from, and it has to be there for the screen drawn by that same commit. Writing the
 * same board twice is a no-op, which is what makes that safe.
 *
 * It lives and dies with the mount, which is exactly the life of a sitting: starting
 * a new session remounts, and a board is never worth reviewing after the session it
 * was played in.
 */
export function useBoardReviews(session: GameSession): BoardReviews {
  const kept = useRef<Map<string, BoardReview>>(new Map());
  const { standing, view } = session;

  if (standing.kind === "field") {
    const played = standing.summary.results[standing.summary.results.length - 1];
    if (played !== undefined) {
      const key = reviewKeyOf(played.board, view.me);
      if (!kept.current.has(key)) {
        const hands = finishedHandsFor(view);
        if (hands !== null) {
          kept.current.set(key, { auction: view.auction, hands, tricks: view.tricksWon });
        }
      }
    }
  }

  return kept.current;
}
