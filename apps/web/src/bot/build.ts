import type { Rng } from "@hb/engine";
import type { DifficultyLevel } from "./difficulty.js";
import { forgetful } from "./forgetful.js";
import { createHeuristicBot } from "./heuristicBot.js";
import type { BotTuning } from "./heuristicBot.js";
import { createSamplingBot } from "./samplingBot.js";
import { simpleBidder } from "./simpleBidder.js";
import type { Bot } from "./types.js";

/**
 * The computer, assembled from a rung.
 *
 * One function because there were two copies and they had diverged, in the
 * direction that does not show up as an error. `bench/rubber.ts` branched to the
 * heuristic bot at zero samples and the app did not — and zero samples is not a
 * quieter version of sampling, it is a **different and broken bot**: every card
 * scores negative infinity, nothing separates them, and the tie-break plays the
 * lowest legal card every single time. So a rung written with `samples: 0` would
 * have measured as a sane weak opponent on the bench and shipped as one that
 * always plays its smallest card, and nothing in the types would have said so.
 *
 * Turning the solver off entirely is the one lever with real range left in it.
 * The sample count saturates — Club, Tournament and Championship measured
 * indistinguishable from each other despite four times the sampling between them
 * — because past a certain count the guessed hands already cover the
 * possibilities. Heuristic card play is a different kind of player rather than a
 * less certain one, which is why it does not saturate: it gives away about twice
 * as many tricks on defence and loses by tens of points a deal.
 *
 * And it is still an opponent that is *wrong the way a person is wrong*. It plays
 * by rules of thumb, which is how a beginner plays, rather than choosing a card
 * it can see is bad. A bot that blundered on purpose was rejected here before and
 * this is not that.
 *
 * `tuning` arrives already merged, so the caller keeps ownership of what beats
 * what — the release, the rung and the player's own dials are three sources and
 * their precedence is a decision for whoever is doing the merging, not for this.
 */
export function botForLevel(options: {
  readonly level: DifficultyLevel;
  readonly rng: Rng;
  readonly tuning: BotTuning;
}): Bot {
  const { level, rng, tuning } = options;
  const played =
    level.samples > 0
      ? createSamplingBot(rng, level.samples, tuning)
      : createHeuristicBot(rng, tuning);
  // The bidder wraps the card play rather than the other way round, because it
  // replaces `chooseCall` alone and passes the draw and every card straight
  // through — so the rung's other levers compose with it untouched.
  const bot = level.bidding === "simple" ? simpleBidder(played) : played;
  return forgetful(bot, level.recall);
}
