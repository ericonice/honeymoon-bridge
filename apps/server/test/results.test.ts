import { describe, expect, it } from "vitest";
import { assignOpponentKeys, DRAWN, outcomeOf } from "../src/results.js";
import type { Tallied } from "../src/results.js";

function entry(account: string | null, token: string, format: "game" | "rubber" = "rubber"): Tallied {
  return {
    account,
    deals: 13,
    drawn: 0,
    format,
    lastPlayed: 1_700_000_000_000,
    lost: 0,
    matches: [],
    name: "Somebody",
    pointsAgainst: 0,
    pointsFor: 100,
    token,
    won: 1,
  };
}

describe("assignOpponentKeys", () => {
  it("gives the same account the same key across both formats", () => {
    const keys = assignOpponentKeys([
      entry("account-1", "token-a", "rubber"),
      entry("account-1", "token-a", "game"),
    ]);
    expect(keys.size).toBe(1);
  });

  it("gives two different accounts different keys", () => {
    const keys = assignOpponentKeys([entry("account-1", "token-a"), entry("account-2", "token-b")]);
    expect(keys.get("account-1")).not.toBe(keys.get("account-2"));
  });

  it("falls back to the device token when there is no account, and groups by it", () => {
    const keys = assignOpponentKeys([
      entry(null, "token-a", "rubber"),
      entry(null, "token-a", "game"),
    ]);
    expect(keys.size).toBe(1);
  });

  it("treats two different device tokens as two different opponents", () => {
    const keys = assignOpponentKeys([entry(null, "token-a"), entry(null, "token-b")]);
    expect(keys.get("token:token-a")).not.toBe(keys.get("token:token-b"));
  });

  // The whole reason this exists rather than sending the account id or
  // device token straight to the client: the token reclaims a dropped seat,
  // so it is a credential, not a label, and the account id is nobody else's
  // to learn.
  it("never hands back the account id or device token as the key itself", () => {
    const keys = assignOpponentKeys([entry("account-1", "token-a")]);
    for (const key of keys.values()) {
      expect(key).not.toBe("account-1");
      expect(key).not.toContain("token-a");
    }
  });
});

/**
 * Three outcomes, which is what this got wrong.
 *
 * `winner === seat` reads a draw as a loss for **both** players — not a rounding
 * error but the wrong answer twice over. Duplicate is what brought it up: a board
 * is flat whenever both of its runs come to the same score, so a short session is
 * level a fair fraction of the time, and before this a drawn match was not recorded
 * at all. A rubber can tie on exactly equal totals too.
 */
describe("how a stored row came out", () => {
  it("names a win and a loss from each seat", () => {
    expect(outcomeOf(0, 0)).toBe("won");
    expect(outcomeOf(0, 1)).toBe("lost");
    expect(outcomeOf(1, 1)).toBe("won");
    expect(outcomeOf(1, 0)).toBe("lost");
  });

  it("names a draw a draw from both seats, rather than a loss for each", () => {
    expect(outcomeOf(DRAWN, 0)).toBe("drawn");
    expect(outcomeOf(DRAWN, 1)).toBe("drawn");
  });

  /** Negative so it can never be mistaken for a seat, which is 0 or 1. */
  it("keeps the sentinel out of the range a seat can take", () => {
    expect(DRAWN).toBeLessThan(0);
  });
});
