import { cardId, playableFrom } from "@hb/engine";
import type { Call, Card, DrawTake, Pair, PlayerView, Rng } from "@hb/engine";
import { createHeuristicBot } from "./heuristicBot.js";
import type { BotTuning } from "./heuristicBot.js";
import { sampleOpponentHand } from "./sample.js";
import { evaluateMoves } from "./solver.js";
import type { Bot, Standing } from "./types.js";

/**
 * Plays by guessing the hand it cannot see, many times over, and solving each
 * guess exactly.
 *
 * The heuristics it replaces were all approximations of one question — what
 * will this card be worth — which is directly computable once both hands are
 * known. So rather than sharpen the approximations, this makes the missing hand
 * up. Any single guess is nearly worthless, but a card that wins tricks across
 * most plausible hands is the card to play, and averaging over guesses is what
 * turns a solver that requires perfect information into a player that has none.
 *
 * The known objection to this in ordinary bridge is that every guess assumes the
 * opponents can also see everything, so a bot never plays for a favorable lie
 * of the cards. With one opponent and no partner most of that objection does not
 * arise: there is no partner to misjudge and no second defender to be endplayed.
 *
 * `samples` is the difficulty lever as well as the cost. It buys accuracy with
 * time, and turning it down is a coherent way to make a weaker opponent — one
 * that is unsure rather than one that is wrong on purpose.
 */

const DEFAULT_SAMPLES = 25;

function bestCard(legal: readonly Card[], totals: Map<string, number>): Card {
  return legal.reduce((best, card) => {
    const value = totals.get(cardId(card)) ?? -Infinity;
    const bestValue = totals.get(cardId(best)) ?? -Infinity;
    if (value !== bestValue) {
      return value > bestValue ? card : best;
    }
    // Nothing separates them, so spend the cheaper one.
    return card.rank < best.rank ? card : best;
  });
}

function chooseBySampling(
  view: PlayerView,
  rng: Rng,
  samples: number,
  remembered: readonly Card[],
): Card {
  const legal = playableFrom(view.hand, view.currentTrick);
  if (legal.length === 1) {
    return legal[0]!;
  }

  const totals = new Map<string, number>();
  for (let sample = 0; sample < samples; sample++) {
    const hands: Pair<readonly Card[]> = [[], []];
    hands[view.me] = view.hand;
    hands[view.opponent] = sampleOpponentHand(view, rng, remembered);

    const values = evaluateMoves({
      hands,
      leader: view.trickLeader,
      strain: view.contract!.strain,
      trick: view.currentTrick,
    });

    for (const value of values) {
      for (const card of value.cards) {
        totals.set(cardId(card), (totals.get(cardId(card)) ?? 0) + value.tricks[view.me]);
      }
    }
  }

  return bestCard(legal, totals);
}

export function createSamplingBot(
  rng: Rng,
  samples: number = DEFAULT_SAMPLES,
  tuning: BotTuning = {},
): Bot {
  // Bidding and the draw are unchanged: this replaces card play only, and both
  // of the others are questions about a hand rather than about a position.
  const heuristic = createHeuristicBot(rng, tuning);

  return {
    name: "Computer",

    chooseCall(view: PlayerView, standing: Standing): Call {
      return heuristic.chooseCall(view, standing);
    },

    chooseDraw(view: PlayerView, remembered: readonly Card[]): DrawTake {
      return heuristic.chooseDraw(view, remembered);
    },

    choosePlay(view: PlayerView, remembered: readonly Card[]): Card {
      return view.contract === null
        ? heuristic.choosePlay(view, remembered)
        : chooseBySampling(view, rng, samples, remembered);
    },
  };
}
