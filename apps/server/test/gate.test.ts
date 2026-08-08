import { describe, expect, it } from "vitest";
import { normalizeCode, normalizeDestination, normalizeName, signInUrl } from "../src/auth.js";
import { signInCode } from "../src/codes.js";
import { refuseSeat } from "../src/seating.js";

const ACCOUNT = { id: "8f1c2d3e-0000-4000-8000-000000000001", name: "Eric" };

describe("taking a seat", () => {
  it("refuses somebody who is not signed in", () => {
    expect(refuseSeat(null)).toBe("Sign in to take a seat");
  });

  it("refuses an account that has not chosen a name", () => {
    // The other player is shown a name and every result keeps one, so a seat
    // with a placeholder in it would be worse than no seat.
    expect(refuseSeat({ id: ACCOUNT.id, name: null })).toBe("Choose a name before taking a seat");
  });

  it("admits a signed-in account with a name", () => {
    expect(refuseSeat(ACCOUNT)).toBeNull();
  });
});

describe("where a sign-in link comes back to", () => {
  it("keeps the queue and a table code", () => {
    expect(normalizeDestination("queue")).toBe("queue");
    expect(normalizeDestination("table/ABCDEF")).toBe("table/ABCDEF");
  });

  it("upper-cases a table code, the way a code is read everywhere else", () => {
    expect(normalizeDestination("table/abcdef")).toBe("table/ABCDEF");
  });

  it("refuses anything that is not one of the two places there are", () => {
    // This decides where somebody lands straight after authenticating. An open
    // redirect built out of a URL fragment is still an open redirect, so the
    // rule is an allowlist rather than an escaping pass.
    for (const raw of [
      "",
      "home",
      "//evil.example",
      "https://evil.example",
      "table/ABCDEF/../..",
      "table/TOOLONGCODE",
      "table/ABCDE",
      "table/ABC0EF",
      "queue?next=https://evil.example",
      42,
      null,
      undefined,
    ]) {
      expect(normalizeDestination(raw)).toBeNull();
    }
  });

  it("rides in the fragment, where it never reaches a server's logs", () => {
    const link = signInUrl({
      appOrigin: "https://play.example",
      destination: "table/ABCDEF",
      token: "a-token",
    });
    expect(link).toBe("https://play.example/#/signin/a-token?to=table%2FABCDEF");
    // The token is the first thing after the marker either way, so a link with
    // nowhere to go back to is the same shape minus the tail.
    expect(
      signInUrl({ appOrigin: "https://play.example", destination: null, token: "a-token" }),
    ).toBe("https://play.example/#/signin/a-token");
  });
});

describe("a sign-in code", () => {
  it("accepts one it issued", () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = signInCode();
      expect(normalizeCode(code)).toBe(code);
    }
  });

  it("reads it the way somebody copies it off a screen", () => {
    // Typed from an email into another app, so case, spaces and a hyphen
    // somebody added themselves are all how people write rather than part of
    // the code.
    expect(normalizeCode("abc def")).toBe("ABCDEF");
    expect(normalizeCode(" ABC-DEF ")).toBe("ABCDEF");
  });

  it("refuses anything that could not be a code", () => {
    for (const raw of ["", "ABCDE", "ABCDEFG", "ABC0EF", "ABCDE!", 123456, null, undefined]) {
      expect(normalizeCode(raw)).toBeNull();
    }
  });
});

describe("a display name", () => {
  it("is trimmed and capped at what fits beside a hand of cards", () => {
    expect(normalizeName("  Eric  ")).toBe("Eric");
    expect(normalizeName("x".repeat(40))).toBe("x".repeat(20));
  });

  it("is refused when there is nothing in it", () => {
    for (const raw of ["", "   ", 7, null, undefined]) {
      expect(normalizeName(raw)).toBeNull();
    }
  });
});
