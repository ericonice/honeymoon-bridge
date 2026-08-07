import type { Call, Card, PlayerView } from "@hb/engine";

/**
 * A computer opponent, as three decision points: keep-or-reject during the
 * draw, a call during the auction, a card during a trick.
 *
 * A bot is handed a `PlayerView` and nothing else — exactly what a human in
 * that seat would see. It must never be given a `DealState`, which is why the
 * engine exposes `legalActionsForView` alongside the privileged `legalActions`.
 *
 * Anything a bot is meant to remember beyond the view — chiefly the 26 cards it
 * saw during the draw, of which 13 are gone — will be passed in as explicit
 * state when there is a bot that uses it. Keeping recall outside the view is
 * what leaves imperfect memory available as a difficulty lever later.
 */
export interface Bot {
  readonly name: string;
  /** A call the auction currently permits. */
  chooseCall(view: PlayerView): Call;
  /** True to keep card 1; false to discard it and take card 2 sight-unseen. */
  chooseDraw(view: PlayerView): boolean;
  /** A card the follow-suit rule currently permits. */
  choosePlay(view: PlayerView): Card;
}
