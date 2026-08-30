// @vitest-environment jsdom
import type { MatchFormat } from "@hb/engine";
import { beforeEach, describe, expect, it } from "vitest";
import {
  preferredFormat,
  queueFormat,
  setPreferredFormat,
  setQueueFormat,
} from "../src/game/identity.js";

/**
 * Every format there is.
 *
 * **The `as const` and the check below are the point of this file.** `preferredFormat`
 * is a *validating* reader — it names the values it accepts and falls back to a rubber
 * for anything else — so widening `MatchFormat` without widening it means the new
 * format is stored perfectly and read back as something else. That is not theoretical:
 * it is what shipped with Mirror. Choosing it stored `"mirror"`, the reader returned
 * `"rubber"`, and the match played was a rubber that would not end at a hundred below
 * the line, because a rubber takes two games. The row said one thing and the game was
 * another.
 *
 * A list of strings alone would not have caught it, since nothing makes a list
 * complete. The assignment underneath fails to *compile* the moment a format exists
 * that is not in this array, which is what makes the round trip below exhaustive
 * rather than merely broad.
 */
const FORMATS = ["duplicate", "game", "mirror", "rubber"] as const;

type Listed = (typeof FORMATS)[number];
const everyFormatIsListed: MatchFormat extends Listed ? true : never = true;

beforeEach(() => {
  localStorage.clear();
});

describe("what format comes back out of storage", () => {
  it("reads back every format that was written", () => {
    expect(everyFormatIsListed).toBe(true);

    for (const format of FORMATS) {
      setPreferredFormat(format);
      expect(preferredFormat()).toBe(format);
    }
  });

  /** Nothing stored is a rubber, which is what this game was before it had formats. */
  it("falls back to a rubber when nothing has been chosen", () => {
    expect(preferredFormat()).toBe("rubber");
  });

  /**
   * And so is a value from a build that knew a format this one does not. The service
   * worker keeps old bundles in circulation, so a newer client can write a format an
   * older one cannot read — the fallback is what stops that being a crash rather than
   * a wrong game.
   */
  it("falls back to a rubber for a format it does not know", () => {
    localStorage.setItem("hb.format", "whist");

    expect(preferredFormat()).toBe("rubber");
  });
});

/**
 * A separate preference from `preferredFormat`, on purpose: Invite and Play the
 * computer always want a real format, but a stranger in the queue may genuinely
 * have none — so its default and its unknown-value fallback both read as "anyone"
 * rather than as a rubber.
 */
describe("what the queue is asked to look for", () => {
  it("reads back every format that was written", () => {
    for (const format of FORMATS) {
      setQueueFormat(format);
      expect(queueFormat()).toBe(format);
    }
  });

  it("reads back null for anyone", () => {
    setQueueFormat("rubber");
    setQueueFormat(null);

    expect(queueFormat()).toBeNull();
  });

  it("defaults to anyone when nothing has been chosen", () => {
    expect(queueFormat()).toBeNull();
  });

  it("reads an unrecognised value as anyone rather than as a guess", () => {
    localStorage.setItem("hb.queueFormat", "whist");

    expect(queueFormat()).toBeNull();
  });
});
