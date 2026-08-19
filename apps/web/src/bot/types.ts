import type { Call, Card, DrawTake, Pair, PlayerView, RubberState } from "@hb/engine";

/**
 * The score the auction is being held over.
 *
 * Kept out of `PlayerView` on purpose. That shape is one *deal* as one seat is
 * entitled to see it, and the rubber is not part of a deal — `GameSession`
 * already carries the standing beside the view rather than inside it, and the
 * server already sends it that way. So this follows the same seam the app and
 * the wire already use, and needs nothing new to cross it.
 *
 * The bidder cannot do its job without this. What a contract is worth is not a
 * number of tricks, it is a number of points, and points depend on where the
 * part-score stands, who is vulnerable, and whether this deal finishes a game.
 * A bidder that only asks "can I make this" is answering a question nobody is
 * paid on.
 */
export interface Standing {
  /**
   * The rubber as it stood when this deal *began*, which is what the deal is
   * bid and scored against — see `rubberBefore` in `table.ts`.
   */
  readonly rubber: RubberState;
  /** Vulnerability for this deal, which follows from the rubber before it. */
  readonly vulnerable: Pair<boolean>;
}

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
  /** A call the auction currently permits, worth what it is worth at this score. */
  chooseCall(view: PlayerView, standing: Standing): Call;
  /**
   * Which card on offer to take: card 1, card 2 sight-unseen, or — under
   * `openDiscard` — the face-up top of the discard pile.
   *
   * `remembered` is what this seat has seen and thrown away — the explicit state
   * this interface always said recall would arrive as, rather than something read
   * out of engine state. Handing over a subset is what makes a forgetful
   * opponent, and it is the only thing that needs to change to build one.
   */
  chooseDraw(view: PlayerView, remembered: readonly Card[]): DrawTake;
  /**
   * A card the follow-suit rule currently permits.
   *
   * Takes `remembered` for the same reason the draw does, and needs it more: a
   * card this seat threw away is a card the opponent cannot be holding, and a
   * bot guessing at their hand without that will deal them cards it watched go
   * face down itself.
   */
  choosePlay(view: PlayerView, remembered: readonly Card[]): Card;
}
