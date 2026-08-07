import { viewFor } from "@hb/engine";
import type { DealAction, DealState, PlayerId } from "@hb/engine";
import type { Bot } from "../bot/types.js";

/**
 * Turns a bot's decision for the current phase into the action the engine wants.
 *
 * The bot is handed `viewFor(state, seat)` and never the state itself, so it
 * cannot see the other hand, the stock or any discard. This is the one place
 * that projection happens, which is what keeps the guarantee checkable.
 */
export function botActionFor(bot: Bot, state: DealState, seat: PlayerId): DealAction {
  const view = viewFor(state, seat);

  switch (state.phase) {
    case "draw": {
      return { type: "draw-decide", keep: bot.chooseDraw(view) };
    }
    case "auction": {
      return { type: "call", call: bot.chooseCall(view) };
    }
    case "play": {
      return { type: "play", card: bot.choosePlay(view) };
    }
    default: {
      throw new Error("A completed deal has nothing left to decide");
    }
  }
}
