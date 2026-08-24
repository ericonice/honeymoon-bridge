import type { BotTuning } from "./heuristicBot.js";

/**
 * Which bot this is.
 *
 * A record against "the computer" pooled across every computer there has ever
 * been is not a record — the same objection §3.7 makes about accounts, that
 * results which only sometimes attach are not results. Versions are numbered
 * from one and named alphabetically after hockey players, so the ordering is
 * unmistakable to anybody reading a list of them.
 *
 * The name is for Settings, beside the version, and nowhere else. Across the
 * table the opponent stays the computer: a player is sitting down against a
 * machine, not against somebody called Angela James, and putting a name in the
 * seat opposite would promise a personality that is not there.
 *
 * Add a release whenever the bot's play changes enough that results before and
 * after are not measuring the same opponent. It cannot be applied backwards —
 * every rubber recorded before this existed has no version and never will.
 */
export interface BotRelease {
  /**
   * Shown in Settings, in full. Ordered alphabetically by *first* name — Angela
   * James, Bobby Orr, Cammi Granato, Doug Harvey, Eddie Shore, Frank Mahovlich,
   * Gordie Howe, Hayley Wickenheiser, Igor Larionov, Jean Béliveau — so that a
   * list of versions reads in the order they existed.
   */
  readonly name: string;
  /**
   * What makes this release itself.
   *
   * Only what the release *decides*, never what the player chose: strength,
   * boldness and the disguise are settings and are merged over this in
   * `localSession.ts`. There was no such field while there was one release,
   * because a field with one possible value is not yet a field.
   */
  readonly tuning: BotTuning;
  readonly version: number;
}

/**
 * **What a release covers: its bidding and its draw, not its card play.**
 *
 * Card play is shared. `sample.ts` and `solver.ts` have no per-release tuning, so
 * a fix there changes how *every* release plays — which happened the day
 * `KEEP_STRENGTH` corrected a sampler that had been imagining an opponent five
 * high-card points too weak. That is a boundary worth stating rather than leaving
 * to be discovered, because `test/botRelease.test.ts` pins only the auction and
 * the draw and would not catch it.
 *
 * Chosen deliberately, and cheaply reversible: `BotTuning` already carries
 * per-release values, so scoping a card-play constant is about twenty lines across
 * four call sites. The reason not to, for now, is that one person is playing, the
 * records are disposable, and a superseded release is worth more as a *fixed
 * reference* than as a museum piece — but a reference whose whole value is being
 * unchanged is exactly what this gives up.
 *
 * **So a cross-release margin measured before a card-play change cannot be quoted
 * after one.** v3 beat v2 65.7% of rubbers with the uniform sampler on both sides;
 * that number is history rather than a fact about the two releases, and the way to
 * have it again is to re-run the bench, which is possible precisely because both
 * releases are still playable.
 *
 * What would reverse this: more than one person playing, or a release that has to
 * stay comparable across a change nobody wants to re-measure.
 */

/**
 * Every release a person can actually sit down against, oldest first.
 *
 * A list rather than the single constant this used to be, and the reason is a
 * cost already paid: v1's code is gone, so `bench/rubber.ts` cannot play it and
 * the 200-point gap between the v1 and v2 rating anchors rests on a measurement
 * nobody can repeat. Keeping a superseded release playable makes the gap to its
 * successor measurable on demand instead of historical.
 *
 * v1 is therefore *not* here. It is still a rating anchor on the server, since
 * rubbers were recorded against it, but it cannot be played and listing it would
 * offer a choice that does not exist.
 *
 * `test/botRelease.test.ts` is what catches the day one of these stops playing the
 * way it did — pinned by what a release *does*, since freezing its tuning would
 * not preserve it: the bot calls the shared engine, the solver and `evaluate.ts`'s
 * calibration, and a refit would change how an old release plays while it went on
 * claiming to be that release.
 */
export const BOT_RELEASES: readonly BotRelease[] = [
  { name: "Bobby Orr", tuning: { objective: "points" }, version: 2 },
  /**
   * Prices calls by the chance of taking the rubber rather than by points.
   *
   * Measured against v2, everything else held identical: 631 rubbers to 169,
   * 78.9% ± 1.4, and +237 points a rubber as well. The whole of the difference is
   * `equity.ts` — v2 credits itself a flat 400 for holding a game, which is worth
   * about half what a game is really worth and the same number at every standing.
   *
   * Its equity table is fitted from v2's own self-play, which makes it an opponent
   * model of v2 rather than of a person. Fitting against recorded human games was
   * tried and there were eleven usable rubbers in the log; see `equity.ts`.
   */
  { name: "Cammi Granato", tuning: { objective: "equity" }, version: 3 },
];

/**
 * The newest release, which is what a fresh install plays and what a bench
 * measures unless it was told otherwise.
 *
 * Derived from the list rather than named separately, so adding a release cannot
 * leave a second constant pointing at the previous one.
 */
export const LATEST_RELEASE: BotRelease = BOT_RELEASES[BOT_RELEASES.length - 1]!;

/**
 * The release a recorded game was played against, by version.
 *
 * Null rather than a throw for a version this build has never heard of: the
 * service worker keeps old builds in circulation, so a client can be handed a
 * version from the future, and a record worth keeping must not depend on being
 * able to name the opponent. Callers that need a name for one show the number.
 */
export function releaseFor(version: number): BotRelease | null {
  return BOT_RELEASES.find((release) => release.version === version) ?? null;
}
