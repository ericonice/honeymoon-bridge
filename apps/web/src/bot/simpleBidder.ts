import { currentDoubling, lastBidEntry, legalActionsForView } from "@hb/engine";
import type { Bid, Call, PlayerView } from "@hb/engine";
import { defensiveTricks, estimatedTricks } from "./evaluate.js";
import type { Bot } from "./types.js";

/**
 * Bids the highest contract it thinks it can make, and nothing cleverer.
 *
 * This is how the bot bid before contracts were priced in points, and replacing
 * it was the largest single bidding improvement here — **+464 points a rubber,
 * 775 rubbers to 225** over a thousand. It survived in `bench/rubber.ts` as the
 * reference the current bidder has to beat, described there as "not a bot any
 * more". It is a bot again: the bottom rung of the difficulty ladder plays it.
 *
 * **It is the right opponent for a kitchen table, and not because it is worse.**
 * Every other difficulty lever makes the bot think *less* about the right
 * question — fewer sampled hands, less search time. This one asks a **simpler and
 * more natural question**: can I make this? Nobody who has just learned the game
 * is pricing a contract against a rubber standing and weighing a sacrifice. So it
 * produces an opponent that is weak in a way you could explain to a person, which
 * is the standard every rung here is held to.
 *
 * What it does not know is everything the current bidder was built to know: what
 * a contract is *worth*. No vulnerability, no part-score carried forward, no game
 * bonus, no rubber standing — so it cannot stretch for a game, cannot sacrifice,
 * cannot tell a cheap set from a ruinous one, and never reads the opponent's bid
 * as evidence about their hand.
 *
 * Only `chooseCall` is replaced. The draw and the card play come from whatever
 * bot this wraps, so the rung's other levers compose with it untouched.
 */
export function simpleBidder(base: Bot): Bot {
  return {
    ...base,
    chooseCall(view: PlayerView): Call {
      const calls = legalActionsForView(view).flatMap((action) =>
        action.type === "call" ? [action.call] : [],
      );
      const bids = calls.flatMap((call) => (call.type === "bid" ? [call.bid] : []));

      let best: Bid | null = null;
      for (const bid of bids) {
        if (estimatedTricks(view.hand, bid.strain) - (bid.level + 6) < 0) {
          continue;
        }
        if (best === null || bid.level > best.level) {
          best = bid;
        }
      }
      if (best !== null) {
        return { type: "bid", bid: best };
      }

      // Doubles from the five level holding three defensive tricks. Kept because
      // a bidder that never doubles cannot punish anything — which, when this was
      // only a bench reference, quietly rigged every constant measured against it:
      // a bot facing an opponent who never doubles should of course fear doubles
      // less and bid games harder. It matters for the same reason across a table,
      // where a beginner who never doubles teaches you to overbid.
      const entry = lastBidEntry(view.auction);
      const theirBid =
        entry !== null && entry.by !== view.me && entry.call.type === "bid" ? entry.call.bid : null;
      if (
        theirBid !== null &&
        theirBid.level >= 5 &&
        currentDoubling(view.auction) === "none" &&
        defensiveTricks(view.hand) >= 3 &&
        calls.some((call) => call.type === "double")
      ) {
        return { type: "double" };
      }

      return { type: "pass" };
    },
  };
}
