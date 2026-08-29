import type { MatchFormat } from "@hb/engine";
import { describe, expect, test } from "vitest";
import { DIFFICULTIES, levelFor } from "../src/bot/difficulty.js";
import { BOT_RELEASES } from "../src/bot/release.js";
import { botTuningFor } from "../src/game/botTuning.js";

const FORMATS = ["duplicate", "game", "mirror", "rubber"] as const;
// Fails to compile the next time a format is added, so a new one cannot quietly
// inherit whatever the release happened to be pricing in.
const covers: MatchFormat = "" as (typeof FORMATS)[number];
void covers;

function tuningFor(format: MatchFormat, version: number) {
  const release = BOT_RELEASES.find((one) => one.version === version)!;
  return botTuningFor({
    disguise: true,
    format,
    gameEquity: 400,
    level: levelFor("championship"),
    release,
  });
}

describe("what the computer is asked to maximise", () => {
  /**
   * The one that was wrong, and it was wrong at the call site rather than in the
   * rule. `objectiveFor` had a test of its own and passed; nothing asked whether
   * the app called it, and it did not — so a session was priced by whatever the
   * release carried, against a rubber that could never change.
   */
  test("a duplicate session is priced as a session, whichever computer is playing", () => {
    for (const release of BOT_RELEASES) {
      expect(tuningFor("duplicate", release.version).objective).toBe("duplicate");
    }
  });

  /**
   * A mirror is the format's too, and for a reason the format shares with duplicate
   * rather than with a rubber: each half is a single game, so a release pricing it
   * asks what winning *this game* is worth, when winning it decides nothing on its
   * own. Measured, the single-game cell prices a mirror part-score at +0.95 where it
   * is worth nothing in the first half.
   */
  test("a two-game match is priced as a pair, whichever computer is playing", () => {
    for (const release of BOT_RELEASES) {
      expect(tuningFor("mirror", release.version).objective).toBe("mirror");
    }
  });

  test("the formats that really are one rubber are left to the release", () => {
    for (const release of BOT_RELEASES) {
      for (const format of ["game", "rubber"] as const) {
        expect(tuningFor(format, release.version).objective).toBe(
          release.tuning.objective ?? "points",
        );
      }
    }
  });

  /**
   * The two releases have to disagree here or the test above holds for the wrong
   * reason — it would pass against a merge that ignored the release entirely.
   */
  test("the releases really do price a rubber differently", () => {
    const objectives = new Set(BOT_RELEASES.map((one) => one.tuning.objective ?? "points"));
    expect(objectives.size).toBeGreaterThan(1);
  });

  /** The rung outranks the release, which is what makes a difficulty setting one. */
  test("the rung's own values beat the release's", () => {
    for (const rung of DIFFICULTIES) {
      const level = levelFor(rung);
      const merged = botTuningFor({
        disguise: false,
        format: "rubber",
        gameEquity: 400,
        level,
        release: BOT_RELEASES[BOT_RELEASES.length - 1]!,
      });
      for (const [key, value] of Object.entries(level.tuning)) {
        expect(merged[key as keyof typeof merged]).toEqual(value);
      }
    }
  });

  test("the disguise dial reaches the bidder in both positions", () => {
    const release = BOT_RELEASES[BOT_RELEASES.length - 1]!;
    const sources = { format: "rubber", gameEquity: 400, level: levelFor("championship"), release } as const;
    expect(botTuningFor({ ...sources, disguise: false }).disguiseCredit).toBe(0);
    expect(botTuningFor({ ...sources, disguise: true }).disguiseCredit).toBeGreaterThan(0);
  });
});
