import type { MatchFormat } from "@hb/engine";
import { describe, expect, it } from "vitest";
import { everyFormatIsListed, isMatchFormat, storedFormat } from "../src/matchFormatRead.js";

/**
 * What a report is allowed to call itself.
 *
 * This exists because the same mistake has now been made twice in two workspaces. The
 * client's `preferredFormat` shipped Mirror broken by reading it back as a rubber; the
 * server did it to Field, filing every session as a rubber with a matchpoint
 * percentage where points go — and **rating** them, because the rating walk excludes
 * `'field'` and those rows did not say `field`. Nothing errored either time.
 *
 * The type-level assertion is the guard that lasts: it fails to compile the next time
 * `MatchFormat` widens. These tests are the second half, checking that a name on the
 * list is actually handled rather than merely listed.
 */

const EVERY: readonly MatchFormat[] = ["duplicate", "field", "game", "mirror", "rubber"];

describe("reading a reported format", () => {
  it("keeps every format the app can play", () => {
    expect(everyFormatIsListed).toBe(true);

    for (const format of EVERY) {
      expect(isMatchFormat(format)).toBe(true);
      expect(storedFormat(format)).toBe(format);
    }
  });

  /**
   * A client too old to know about formats sent nothing, and a rubber is what it was
   * playing. That is a *default*, not a catch-all: a format this build knows must
   * never reach it, which is what the loop above is for.
   */
  it("reads anything it does not know as a rubber", () => {
    for (const value of [undefined, null, "", "whist", 7, {}]) {
      expect(isMatchFormat(value)).toBe(false);
      expect(storedFormat(value)).toBe("rubber");
    }
  });
});
