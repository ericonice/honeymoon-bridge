import { describe, expect, it } from "vitest";
import { assignOpponentKeys } from "../src/results.js";
import type { Tallied } from "../src/results.js";

function entry(account: string | null, token: string, format: "game" | "rubber" = "rubber"): Tallied {
  return {
    account,
    deals: 13,
    format,
    lastPlayed: 1_700_000_000_000,
    lost: 0,
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
