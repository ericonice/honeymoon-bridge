import type { BotTuning } from "./heuristicBot.js";

/**
 * How hard the computer plays, as one setting instead of four.
 *
 * Difficulty was spread across `strength`, `boldness`, the disguise and the
 * opponent picker — four rows that all changed how hard the game was, none of
 * which said so, and which between them required knowing what a sample count is.
 * This is the one control that replaces them; the others belong behind the
 * playtester flag, which is what `identity.ts` always said should happen once the
 * questions they existed to answer were answered.
 *
 * **Every rung makes the bot wrong the way a person is wrong.** It thinks for
 * less time, and at the bottom it stops working the hand out and plays by rules
 * of thumb. Neither makes it play a card it knows is bad — an opponent that
 * blunders on purpose is not a weaker player but a broken one, and that failure
 * was rejected here once already.
 */
export type Difficulty = "championship" | "club" | "kitchen";

export interface DifficultyLevel {
  /**
   * Which question the bidder asks.
   *
   * `"priced"` is the release's own bidder, which asks what a contract is
   * *worth* against the rubber standing. `"simple"` asks only whether it can be
   * made — see `simpleBidder`, which is what the bot did before contracts were
   * priced at all.
   *
   * This is the one lever that changes *what the bidder is* rather than how much
   * of it runs, and it is deliberately confined to the bottom rung. Every other
   * lever makes the bot think less about the right question; this one asks a
   * simpler and more natural one, which is why it belongs at a kitchen table and
   * nowhere above it.
   */
  readonly bidding: "priced" | "simple";
  /**
   * How many of its own thirteen discards it remembers.
   *
   * **Held at thirteen on every rung, because it was measured and it is worth
   * nothing.** Cutting recall from 13 to 3 with everything else at full strength
   * came out at 57.5% ± 7.5 to the *forgetful* side over 40 rubbers — a null, and
   * if anything the wrong sign. Memory is not what makes this bot strong.
   *
   * Kept as a field rather than deleted, and the distinction matters: this is a
   * lever whose effect has been observed and found to be zero, not one that has
   * never been looked at. The measurement also covers only the top of the ladder
   * — at six samples or none, each guessed hand carries more weight and a
   * misremembered card may cost more — so the mechanism stays wired through
   * `botForLevel` for whenever somebody measures that.
   *
   * There is a cliff in it if it ever moves: replaying the opponent's draw needs
   * the pool to be *exactly* the twenty-six cards they were offered, which
   * requires remembering all thirteen. Anything less falls back to weighting by
   * rank, so this is not a dial with a smooth response.
   */
  readonly recall: number;
  /** Hands it guesses at before each card. Zero means no solver at all. */
  readonly samples: number;
  readonly tuning: BotTuning;
}

/**
 * Named for where the game is played rather than for how hard it is.
 *
 * "Easy" and "hard" describe the player; a kitchen table and a championship
 * describe the opponent, which is the thing being chosen. It also keeps these
 * clear of the hockey names on `release.ts`: one says *who* you are playing, the
 * other says *how hard*.
 *
 * **Three rather than four, and the fourth was removed because it did not
 * exist.** The first ladder had Kitchen, Club, Tournament and Championship, and
 * measurement found the top three indistinguishable — Tournament against
 * Championship was 40–40 over 80 rubbers. The levers saturate: past a certain
 * sample count the guessed hands already cover the possibilities, so more of
 * everything buys a slower bot rather than a stronger one. What is left is about
 * 380 rating points of real range, and the instrument measuring it carries error
 * bars of roughly ±50. Four rungs would sit inside that noise; three at two
 * hundred apart are unambiguous.
 */
export const DIFFICULTIES: readonly Difficulty[] = ["kitchen", "club", "championship"];

export const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  championship: "Championship",
  club: "Club",
  kitchen: "Kitchen",
};

export const DIFFICULTY_BLURB: Readonly<Record<Difficulty, string>> = {
  championship: "Works out every card and thinks hard about every call.",
  club: "Works the hand out, but briefly, and bids on what it can see.",
  kitchen: "Plays by rules of thumb rather than working the hand out.",
};

/**
 * The three rungs, spaced on the two levers that were measured to do anything.
 *
 * Against Championship over 40 rubbers each, one lever at a time:
 *
 * | change | win rate | worth |
 * | --- | --- | --- |
 * | recall 13 → 3 | 57.5% ± 7.5 | nothing |
 * | samples 60 → 6 | 40.0% ± 7.4 | ~70 |
 * | bid search off | 35.0% ± 7.3 | ~108 |
 * | solver off entirely | 17.5% ± 6.1 | ~269 |
 *
 * **They do not compose additively, and assuming they did is what cost a
 * measurement.** With the bid search on, going 60 samples to none is worth 172;
 * with it off, the same change is worth 70. Turning off one way of thinking makes
 * the other matter less. Stacking every lever reaches only ~261, not the ~380 the
 * parts suggest — which is why the bottom rung needed something other than *less
 * of the same*, and got a different bidder instead.
 *
 * **The bid search is a rung, not a release.** It is how *long the bot thinks*,
 * which is exactly what a rung owns, where `release.ts` owns what it thinks
 * *with*. That is why v3 carries no search budget of its own and Championship
 * carries it: the same bidder searching or not is one opponent playing harder.
 *
 * Kitchen's `bidding: "simple"` does cross that line, and it is the only thing
 * here that does. It was argued against on exactly those grounds and then
 * allowed, for a reason unrelated to the boundary: asking "can I make this" is
 * how a person new to the game bids, so it is the only lever that makes the bot
 * weak in a way somebody could explain, rather than quietly under-resourced.
 * `release.ts` says the same thing from the other side.
 */
export const DIFFICULTY_LEVELS: Readonly<Record<Difficulty, DifficultyLevel>> = {
  championship: {
    bidding: "priced",
    recall: 13,
    samples: 60,
    tuning: { searchBudgetMs: 250, searchSamples: 25 },
  },
  // Zero rather than a small budget: `searchBudgetMs` is inherited from the
  // release's tuning if this leaves the key out, so an empty object would not
  // turn the search off, it would silently keep whatever the release set.
  club: { bidding: "priced", recall: 13, samples: 6, tuning: { searchBudgetMs: 0 } },
  kitchen: { bidding: "simple", recall: 13, samples: 0, tuning: { searchBudgetMs: 0 } },
};

export function levelFor(difficulty: Difficulty): DifficultyLevel {
  return DIFFICULTY_LEVELS[difficulty];
}
