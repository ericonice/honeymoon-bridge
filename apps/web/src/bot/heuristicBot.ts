import { legalActionsForView } from "@hb/engine";
import type { Bid, Call, Card, PlayerView, Rng } from "@hb/engine";
import { chooseCard } from "./cardPlay.js";
import { shouldKeepCard } from "./drawDecision.js";
import { defensiveTricks, estimatedTricks } from "./evaluate.js";
import { createRandomBot } from "./randomBot.js";
import type { Bot } from "./types.js";

const BOOK = 6;

/** Only worth doubling once they are high enough that going down costs them properly. */
const DOUBLE_FROM_LEVEL = 5;

/** And only holding enough on defence to expect to beat it. */
const DOUBLE_TRICKS = 3;

function legalBids(view: PlayerView): Bid[] {
  return legalActionsForView(view).flatMap((action) =>
    action.type === "call" && action.call.type === "bid" ? [action.call.bid] : [],
  );
}

function canCall(view: PlayerView, type: "double" | "pass"): boolean {
  return legalActionsForView(view).some(
    (action) => action.type === "call" && action.call.type === type,
  );
}

/** The level the opponent has bid to, or null if nobody has bid. */
function standingLevel(view: PlayerView): number | null {
  for (let index = view.auction.length - 1; index >= 0; index--) {
    const entry = view.auction[index]!;
    if (entry.call.type === "bid") {
      return entry.call.bid.level;
    }
  }
  return null;
}

/**
 * The most this hand can bid and still expect to make it.
 *
 * Every legal bid is measured against what the hand is worth in that strain, so
 * being outbid in one suit naturally pushes the bot into another it can afford
 * rather than into a level it cannot. Among affordable bids it takes the
 * highest, because a part-score that stops short of what the hand is worth
 * leaves points below the line — and below the line is the only place a game
 * can be won.
 */
function bestAffordableBid(view: PlayerView): Bid | null {
  let best: Bid | null = null;
  let bestMargin = 0;

  for (const bid of legalBids(view)) {
    const margin = estimatedTricks(view.hand, bid.strain) - (bid.level + BOOK);
    if (margin < 0) {
      continue;
    }
    if (best === null || bid.level > best.level || (bid.level === best.level && margin > bestMargin)) {
      best = bid;
      bestMargin = margin;
    }
  }

  return best;
}

/**
 * Bids from what its own hand is worth, and passes rather than competing past
 * it. Draw decisions and card play are still random — this fixes the auction
 * only, which is where nearly all of the random bot's contracts were lost.
 */
export function createHeuristicBot(rng: Rng): Bot {
  const fallback = createRandomBot(rng);

  return {
    name: "Heuristic bidding",

    chooseCall(view: PlayerView): Call {
      const bid = bestAffordableBid(view);
      if (bid !== null) {
        return { type: "bid", bid };
      }

      const level = standingLevel(view);
      if (
        level !== null &&
        level >= DOUBLE_FROM_LEVEL &&
        defensiveTricks(view.hand) >= DOUBLE_TRICKS &&
        canCall(view, "double")
      ) {
        return { type: "double" };
      }

      // Passing is always legal, but ask rather than assume.
      return canCall(view, "pass") ? { type: "pass" } : { type: "bid", bid: legalBids(view)[0]! };
    },

    chooseDraw(view: PlayerView): boolean {
      return view.pending === null
        ? fallback.chooseDraw(view)
        : shouldKeepCard(view.hand, view.pending);
    },

    choosePlay(view: PlayerView): Card {
      return view.contract === null ? fallback.choosePlay(view) : chooseCard(view);
    },
  };
}
