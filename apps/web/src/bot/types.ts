import type { Call, Card, DrawTake, PlayerView, Standing } from "@hb/engine";
import type { BoardMemory } from "./boardRecall.js";

/**
 * The score the auction is being held over.
 *
 * Declared in the engine now and re-exported here under the name the bot uses.
 * Two hosts have to be able to produce one — the browser for the game against the
 * computer and a Durable Object for a game between people — which is the same
 * argument `table.ts` makes for the sitting living there rather than in a host.
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
export type { Standing };

/**
 * Boards this seat has played before, for the two decisions that can use them.
 *
 * Optional, and separate from `remembered` rather than folded into it, because the two
 * are different kinds of recall: `remembered` is a flat set of cards that are provably
 * nowhere, where this is a *pairing* — which card was offered against which — and it
 * is that structure the sampler exploits. An implementation with no use for it simply
 * omits the parameter, which is why adding it broke nothing.
 *
 * Handed over per decision like everything else the bot remembers, so a rung can hand
 * over less of it. `chooseDraw` does not take it: on a replay this seat knows the pool
 * it is being offered but not the order, which is a much weaker fact than the pairing
 * the other two get, and nothing has measured it.
 */
export type { BoardMemory };

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
  /**
   * `remembered` is the cards this seat threw away, the same explicit state
   * `chooseDraw` and `choosePlay` are handed. The bidder had no use for it while
   * it counted its own hand; a bidder that guesses the *other* hand cannot do
   * without it, since thirteen of the cards it would otherwise deal the opponent
   * are ones it watched itself bury — and in this game that is half of what it
   * cannot place.
   */
  chooseCall(
    view: PlayerView,
    standing: Standing,
    remembered: readonly Card[],
    boards?: BoardMemory,
  ): Call;
  /**
   * Which card on offer to take: card 1, or card 2 sight-unseen.
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
  choosePlay(view: PlayerView, remembered: readonly Card[], boards?: BoardMemory): Card;
}
