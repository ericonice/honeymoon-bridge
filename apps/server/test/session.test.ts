import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "../src/auth.js";
import type { Env } from "../src/env.js";

const ACCOUNT = "8f1c2d3e-0000-4000-8000-000000000001";
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Only the secret is ever read by either function, so nothing else is needed. */
function env(secret: string): Env {
  return { SESSION_SECRET: secret } as Env;
}

describe("signed sessions", () => {
  it("names the account it was issued for", async () => {
    const now = 1_700_000_000_000;
    const session = await signSession(ACCOUNT, env("a-secret"), now);
    expect(await verifySession(session, env("a-secret"), now)).toBe(ACCOUNT);
  });

  it("is refused once the signing secret has been rotated", async () => {
    const now = 1_700_000_000_000;
    const session = await signSession(ACCOUNT, env("the-old-secret"), now);
    // Rotation is the only revocation there is, so this has to hold.
    expect(await verifySession(session, env("the-new-secret"), now)).toBeNull();
  });

  it("refuses a payload edited to name a different account", async () => {
    const now = 1_700_000_000_000;
    const session = await signSession(ACCOUNT, env("a-secret"), now);
    const [, signature] = session.split(".");
    const forged = btoa(JSON.stringify({ iat: now, sub: "somebody-else" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifySession(`${forged}.${signature!}`, env("a-secret"), now)).toBeNull();
  });

  it("refuses a signature that has been altered", async () => {
    const now = 1_700_000_000_000;
    const session = await signSession(ACCOUNT, env("a-secret"), now);
    const tampered = `${session.slice(0, -4)}AAAA`;
    expect(await verifySession(tampered, env("a-secret"), now)).toBeNull();
  });

  it("expires after a year", async () => {
    const issued = 1_700_000_000_000;
    const session = await signSession(ACCOUNT, env("a-secret"), issued);
    expect(await verifySession(session, env("a-secret"), issued + YEAR_MS - 1000)).toBe(ACCOUNT);
    expect(await verifySession(session, env("a-secret"), issued + YEAR_MS + 1000)).toBeNull();
  });

  it("refuses rubbish rather than throwing on it", async () => {
    // This is reached straight from a WebSocket join, so anything at all can
    // arrive here. Throwing would drop the socket over a bad string.
    const now = 1_700_000_000_000;
    for (const rubbish of ["", ".", "..", "not-a-session", "a.b", "!!!!.????", "a.".repeat(50)]) {
      await expect(verifySession(rubbish, env("a-secret"), now)).resolves.toBeNull();
    }
  });
});
