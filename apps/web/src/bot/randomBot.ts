import { legalActionsForView } from "@hb/engine";
import type { Call, Card, DealAction, PlayerView, Rng } from "@hb/engine";
import type { Bot } from "./types.js";

function pick<T>(items: readonly T[], rng: Rng): T {
  const chosen = items[Math.floor(rng.next() * items.length)];
  if (chosen === undefined) {
    throw new Error("Asked to choose with no legal action available");
  }
  return chosen;
}

function callsFrom(actions: readonly DealAction[]): Call[] {
  return actions.flatMap((action) => (action.type === "call" ? [action.call] : []));
}

function cardsFrom(actions: readonly DealAction[]): Card[] {
  return actions.flatMap((action) => (action.type === "play" ? [action.card] : []));
}

/**
 * Picks uniformly at random from whatever the rules allow.
 *
 * It is not trying to play well and it will bid nonsense. It exists so that
 * every path through the engine has an opponent to drive it while the question
 * on the table is still whether the game itself feels right in the hand.
 */
export function createRandomBot(rng: Rng): Bot {
  return {
    name: "Random",

    chooseCall(view: PlayerView): Call {
      // The standing is ignored on purpose: this bot is not trying to be right
      // about anything, and pretending otherwise would make it look like it was.
      return pick(callsFrom(legalActionsForView(view)), rng);
    },

    chooseDraw(): boolean {
      return rng.next() < 0.5;
    },

    choosePlay(view: PlayerView): Card {
      // Recall is offered and ignored, like everything else this bot is told.
      return pick(cardsFrom(legalActionsForView(view)), rng);
    },
  };
}
