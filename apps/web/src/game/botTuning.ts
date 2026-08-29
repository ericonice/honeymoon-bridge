import type { MatchFormat } from "@hb/engine";
import { objectiveFor } from "../bot/bidValue.js";
import type { DifficultyLevel } from "../bot/difficulty.js";
import { DISGUISE_CREDIT_ON } from "../bot/heuristicBot.js";
import type { BotTuning } from "../bot/heuristicBot.js";
import type { BotRelease } from "../bot/release.js";

export interface BotTuningSources {
  /** Whether the computer may name a suit other than its honest best. */
  readonly disguise: boolean;
  /** What is being played, which is the one source a release does not outrank. */
  readonly format: MatchFormat;
  /** What a game in hand is worth, from the boldness dial. Only the points objective reads it. */
  readonly gameEquity: number;
  /** The rung: how hard it is being asked to play. */
  readonly level: DifficultyLevel;
  /** The release: which computer it is. */
  readonly release: BotRelease;
}

/**
 * Everything that decides how the computer bids, merged in precedence order.
 *
 * The release, then the rung, then the player's own dials, then the format — what
 * the opponent *is*, how hard it is asked to play, the leftovers from before
 * difficulty existed, and finally the one thing none of them get a say in.
 *
 * **Its own function because the precedence is what went wrong, silently.**
 * `objectiveFor` exists so that the app and the bench cannot disagree about which
 * objective a format is played for, and its own doc comment says so — and for as
 * long as it had existed, **nothing in the app called it.** The tuning was built
 * from the release and the rung alone, so a duplicate session was played by
 * whatever pricing the release happened to carry: v3 priced every board by the
 * change in its chance of taking a rubber that was freshly minted, never advanced
 * and could not be won. `duplicateFrom` — the pricing written for the format,
 * tested, and documented as what a session is played for — was never reached.
 *
 * A merge inlined at its one call site cannot be tested, and the test that existed
 * asked `objectiveFor` directly, which is the question the function answers rather
 * than the question of whether anybody asks it.
 */
export function botTuningFor({
  disguise,
  format,
  gameEquity,
  level,
  release,
}: BotTuningSources): BotTuning {
  return {
    ...release.tuning,
    ...level.tuning,
    disguiseCredit: disguise ? DISGUISE_CREDIT_ON : 0,
    gameEquity,
    // Last, because the format outranks everything above it. A release chooses how
    // it prices a standing; it does not get to choose that there is one.
    objective: objectiveFor(format, release.tuning.objective ?? "points"),
  };
}
