import { cardId, createRng } from "@hb/engine";
import type { Call, Card, DrawTake, PlayerView, Rng } from "@hb/engine";
import type { Bot, Standing } from "./types.js";

/**
 * A bot that forgets some of what it threw away.
 *
 * Discards are never shown back (§1.4), so remembering them is part of the game
 * and a person forgets some of the thirteen. The bot forgets none, which is an
 * advantage it was never entitled to — and taking it away is the difficulty lever
 * this project has always said it wanted, because it makes the opponent wrong the
 * way a *person* is wrong rather than wrong on purpose. A bot that plays a
 * deliberately bad card is not a weaker player, it is a broken one.
 *
 * A decorator rather than a flag threaded through three bots. `botTurn.ts` hands
 * every decision the cards this seat discarded, so forgetting is exactly "pass on
 * less than you were given" — which keeps the inner bots honest, since memory
 * stays something handed *to* a bot rather than something it reaches for, and
 * leaves one small testable thing instead of a condition in three places.
 */

/**
 * Which cards are forgotten is fixed for the deal, not re-rolled per decision.
 *
 * A bot that forgot a different subset on every turn would not be forgetful, it
 * would be inconsistent — it might rule a card out while bidding and deal it to
 * the opponent two tricks later. Real forgetting is stable: the cards that went
 * are gone. Seeded from the discards themselves so a deal replays identically.
 */
function remembered(all: readonly Card[], keeps: number, rng: Rng): Card[] {
  if (keeps >= all.length) {
    return [...all];
  }
  if (keeps <= 0) {
    return [];
  }
  return [...all]
    .map((card) => ({ card, key: rng.next() }))
    .sort((one, two) => one.key - two.key)
    .slice(0, keeps)
    .map((one) => one.card);
}

/** A stable seed for one deal's forgetting, from the cards themselves. */
function seedFrom(discards: readonly Card[]): number {
  let seed = 2166136261;
  for (const card of discards) {
    for (const character of cardId(card)) {
      seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
    }
  }
  return seed >>> 0;
}

/**
 * Wraps a bot so it is only ever told `keeps` of the cards it threw away.
 *
 * `keeps` at or above thirteen is perfect recall and the bot is returned
 * unwrapped, so the strongest setting carries no cost and no behaviour change at
 * all — which is what keeps a pinned release pinned.
 */
export function forgetful(bot: Bot, keeps: number): Bot {
  if (keeps >= 13) {
    return bot;
  }
  const recall = (discards: readonly Card[]): Card[] =>
    remembered(discards, keeps, createRng(seedFrom(discards)));

  return {
    name: bot.name,
    chooseCall(view: PlayerView, standing: Standing, discards: readonly Card[]): Call {
      return bot.chooseCall(view, standing, recall(discards));
    },
    chooseDraw(view: PlayerView, discards: readonly Card[]): DrawTake {
      return bot.chooseDraw(view, recall(discards));
    },
    choosePlay(view: PlayerView, discards: readonly Card[]): Card {
      return bot.choosePlay(view, recall(discards));
    },
  };
}
