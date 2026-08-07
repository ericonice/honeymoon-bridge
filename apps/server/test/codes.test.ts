import { describe, expect, it } from "vitest";
import { dealSeed, inviteCode, isInviteCode } from "../src/codes.js";

describe("invite codes", () => {
  it("uses only characters that survive being read aloud", () => {
    // No 0/O and no 1/I/L: a code gets spoken across a room as well as sent.
    const confusable = /[01OIL]/;
    for (let attempt = 0; attempt < 200; attempt++) {
      expect(inviteCode()).not.toMatch(confusable);
    }
  });

  it("is six characters, which is what gets typed on a phone", () => {
    expect(inviteCode()).toHaveLength(6);
  });

  it("does not repeat itself", () => {
    const codes = new Set(Array.from({ length: 500 }, () => inviteCode()));
    expect(codes.size).toBe(500);
  });

  it("recognises its own codes and rejects anything else", () => {
    expect(isInviteCode(inviteCode())).toBe(true);
    expect(isInviteCode("")).toBe(false);
    expect(isInviteCode("ABC")).toBe(false);
    expect(isInviteCode("ABCDEFG")).toBe(false);
    // Lowercase is normalised before this is reached, never accepted here.
    expect(isInviteCode("abcdef")).toBe(false);
    expect(isInviteCode("AAAA0A")).toBe(false);
  });
});

describe("deal seeds", () => {
  it("is a whole number inside the range the engine's generator expects", () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const seed = dealSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("does not repeat, since a repeated seed is a repeated deal", () => {
    const seeds = new Set(Array.from({ length: 500 }, () => dealSeed()));
    expect(seeds.size).toBe(500);
  });
});
