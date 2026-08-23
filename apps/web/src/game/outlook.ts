import { trickOutlook } from "@hb/engine";
import type { PlayerId, PlayerView, TrickOutlook } from "@hb/engine";

/**
 * Where this deal stands for one seat, or null if the question does not apply.
 *
 * Null covers a passed-out deal and everything before the auction settles, which
 * are the two cases with no contract to be measured against. Takes the seat
 * explicitly because the play screen draws *both* — see `TrickRing`, where the
 * opponent's ring is what turns "this can no longer be made" from arithmetic into
 * something on screen.
 *
 * Plumbing rather than a rule: the arithmetic is the engine's `trickOutlook`, so
 * the screen and the sound cannot come to different conclusions about the same
 * deal, and neither can disagree with `scoreDeal`.
 */
export function outlookFor(view: PlayerView, seat: PlayerId = view.me): TrickOutlook | null {
  if (view.contract === null) {
    return null;
  }
  return trickOutlook({ contract: view.contract, seat, tricksWon: view.tricksWon });
}

/** Whether the given seat is the one that has to make the contract rather than break it. */
export function declaringIn(view: PlayerView, seat: PlayerId = view.me): boolean {
  return view.contract?.declarer === seat;
}
