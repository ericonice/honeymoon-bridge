import { newRubber, viewFor, vulnerability } from "@hb/engine";
import type { DealAction, DealState, PlayerId } from "@hb/engine";
import type { Bot, Standing } from "../bot/types.js";

export interface BotTurn {
  readonly bot: Bot;
  readonly seat: PlayerId;
  /**
   * The score this deal is being bid at. Only the auction reads it, but it is
   * required rather than optional: what a contract is worth depends on it, so a
   * bot measured at a score nobody chose is a bot measured at the wrong one.
   */
  readonly standing: Standing;
  readonly state: DealState;
}

/** Love all — the standing a deal played on its own is being bid at. */
export function loveAll(): Standing {
  const rubber = newRubber();
  return { rubber, vulnerable: vulnerability(rubber) };
}

/**
 * Turns a bot's decision for the current phase into the action the engine wants.
 *
 * The bot is handed `viewFor(state, seat)` and never the state itself, so it
 * cannot see the other hand, the stock or any discard. This is the one place
 * that projection happens, which is what keeps the guarantee checkable. The
 * standing travels beside the view rather than inside it, for the same reason
 * `GameSession` keeps it beside: it belongs to the sitting, not to the deal.
 */
export function botActionFor({ bot, seat, standing, state }: BotTurn): DealAction {
  const view = viewFor(state, seat);

  switch (state.phase) {
    case "draw": {
      // The one thing a bot is given beyond its view: the cards it threw away
      // and therefore saw. Not a leak — a player is entitled to remember their
      // own discards, and §1.4 says so. It is handed over here rather than read
      // from the engine so that a forgetful bot is a matter of passing less.
      return { type: "draw-decide", keep: bot.chooseDraw(view, state.discards[seat]) };
    }
    case "auction": {
      return { type: "call", call: bot.chooseCall(view, standing) };
    }
    case "play": {
      return { type: "play", card: bot.choosePlay(view, state.discards[seat]) };
    }
    default: {
      throw new Error("A completed deal has nothing left to decide");
    }
  }
}
