import { legalActionsForView, newRubber, viewFor, vulnerability } from "@hb/engine";
import type { DealAction, DealState, PlayerId } from "@hb/engine";
import { shouldAcceptClaim } from "../bot/claimDecision.js";
import type { BoardMemory, Bot, Standing } from "../bot/types.js";

export interface BotTurn {
  /**
   * Boards this seat has played before, for a session that replays them.
   *
   * Optional, and empty for every rubber — a board only comes round in duplicate.
   * The host records it and hands it over, which is the same rule the discards
   * follow: never read from engine state, so that handing over less is all a
   * forgetful opponent takes.
   *
   * Deliberately *not* accompanied by which board this is, though the host knows.
   * Working that out from the cards is most of what a person does on a replay, and
   * being told would make the bot strong in a way no person could be — see
   * `offersFacingOpponent`.
   */
  readonly boards?: BoardMemory;
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
export function botActionFor({ boards = [], bot, seat, standing, state }: BotTurn): DealAction {
  // Not a phase of its own — a claim is a sub-state of "play" — so it is
  // checked ahead of the phase switch below rather than inside it. The bot
  // never originates a "claim" action itself (§4: human-only for now), so this
  // is the only claim-related branch `botActionFor` needs.
  if (state.claim !== null) {
    return { type: "claim-response", accept: shouldAcceptClaim(state) };
  }

  const view = viewFor(state, seat);

  switch (state.phase) {
    case "draw": {
      // The one thing a bot is given beyond its view: the cards it threw away
      // and therefore saw. Not a leak — a player is entitled to remember their
      // own discards, and §1.4 says so. It is handed over here rather than read
      // from the engine so that a forgetful bot is a matter of passing less.
      return { type: "draw-decide", take: bot.chooseDraw(view, state.discards[seat]) };
    }
    case "auction": {
      return {
        type: "call",
        call: bot.chooseCall(view, standing, state.discards[seat], boards),
      };
    }
    case "play": {
      return { type: "play", card: bot.choosePlay(view, state.discards[seat], boards) };
    }
    default: {
      throw new Error("A completed deal has nothing left to decide");
    }
  }
}

/**
 * The safest legal action for this seat, for when the bot's own decision has
 * just thrown rather than answered.
 *
 * Never invented: every candidate is one `legalActionsForView` already
 * considers legal, so this can only ever apply a move the engine accepts.
 * Pass is preferred wherever it is legal, since it changes the auction least;
 * rejecting a claim over accepting one, for the same reason; otherwise
 * whichever legal action comes first. A seat with no legal action at all is
 * not a case this should paper over, so that throws rather than guessing.
 */
export function fallbackActionFor(state: DealState, seat: PlayerId): DealAction {
  const legal = legalActionsForView(viewFor(state, seat));
  const first = legal[0];
  if (first === undefined) {
    throw new Error("No legal action for a seat that is on turn");
  }
  const pass = legal.find((action) => action.type === "call" && action.call.type === "pass");
  const rejectClaim = legal.find((action) => action.type === "claim-response" && !action.accept);
  return pass ?? rejectClaim ?? first;
}
