import type { Env } from "./env.js";

/** How long a sign-in link stays usable. Long enough to switch to an inbox, no longer. */
const LINK_TTL_MS = 10 * 60 * 1000;

/** How long a session lasts. Signing in should be a thing you do once per device. */
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** Outstanding links per address before we stop sending. Blunt, and enough. */
const MAX_PENDING_LINKS = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Lower-cased and trimmed, or null if it could not be an address.
 *
 * Case folding matters more than the shape check: without it one person signs
 * up twice and ends up with two records and one confusing history.
 */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const email = raw.trim().toLowerCase();
  // Deliberately loose. The real proof that an address is valid and belongs to
  // this person is that the link arrives and gets opened.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** Only the hash is stored, so a copy of the table grants nobody a login. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(digest));
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * A session as a signed statement rather than a stored row.
 *
 * Nothing to look up on each request, and nothing to leak: the signature is
 * what makes it trustworthy, so the server holds no session table at all.
 */
export async function signSession(accountId: string, env: Env, now: number): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ iat: now, sub: accountId })));
  const key = await signingKey(env.SESSION_SECRET);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The account this session belongs to, or null if it is forged, altered or stale. */
export async function verifySession(session: string, env: Env, now: number): Promise<string | null> {
  const [payload, signature] = session.split(".");
  if (payload === undefined || signature === undefined) {
    return null;
  }

  // Everything below decodes a string a client handed over, so all of it sits
  // inside the guard. `atob` throws on characters that are not base64, and this
  // is now reached from a WebSocket join — an exception there would drop the
  // socket over a malformed session that simply deserves to be refused.
  try {
    const key = await signingKey(env.SESSION_SECRET);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!ok) {
      return null;
    }

    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      iat?: unknown;
      sub?: unknown;
    };
    if (typeof claims.sub !== "string" || typeof claims.iat !== "number") {
      return null;
    }
    return now - claims.iat > SESSION_TTL_MS ? null : claims.sub;
  } catch {
    return null;
  }
}

/** The links outstanding for an address, and when the oldest stops counting. */
async function pendingLinks(
  env: Env,
  email: string,
  now: number,
): Promise<{ readonly count: number; readonly oldestAt: number | null }> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS pending, MIN(created_at) AS oldest FROM magic_links WHERE email = ? AND used_at IS NULL AND created_at > ?",
  )
    .bind(email, now - RATE_WINDOW_MS)
    .first<{ oldest: number | null; pending: number }>();
  return { count: row?.pending ?? 0, oldestAt: row?.oldest ?? null };
}

export type LinkRequest =
  | { readonly kind: "rate-limited"; readonly retryAfterMs: number }
  | { readonly kind: "send-failed" }
  | { readonly kind: "sent" };

/**
 * Issues a sign-in link.
 *
 * The link itself never leaves this function. It goes to the address or it goes
 * nowhere — a caller that could see it would be one more place for a live
 * credential to end up.
 */
export async function requestLink(
  env: Env,
  email: string,
  appOrigin: string,
  now: number,
): Promise<LinkRequest> {
  const pending = await pendingLinks(env, email, now);
  if (pending.count >= MAX_PENDING_LINKS) {
    return {
      kind: "rate-limited",
      retryAfterMs:
        pending.oldestAt === null
          ? RATE_WINDOW_MS
          : Math.max(0, pending.oldestAt + RATE_WINDOW_MS - now),
    };
  }

  const token = newToken();
  const tokenHash = await hashToken(token);
  await env.DB.prepare(
    "INSERT INTO magic_links (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(tokenHash, email, now + LINK_TTL_MS, now)
    .run();

  if (!(await sendMagicLink(env, email, `${appOrigin}/#/signin/${token}`))) {
    // A link that was never sent must not count against the next attempt. The
    // row has to be written first, since the token must exist before it is
    // mailed — but if the mail did not happen, the row records nothing, and
    // leaving it there rate-limits somebody for our failure rather than theirs.
    await env.DB.prepare("DELETE FROM magic_links WHERE token_hash = ?").bind(tokenHash).run();
    return { kind: "send-failed" };
  }

  return { kind: "sent" };
}

export interface SignedIn {
  readonly accountId: string;
  readonly email: string;
  readonly session: string;
}

/**
 * Spends a sign-in link.
 *
 * The update is the lock: marking the row used and requiring it to be unused in
 * the same statement means two taps on the same link cannot both succeed, with
 * no transaction to get wrong.
 *
 * `deviceToken` is the anonymous token the browser already had. It is claimed
 * rather than replaced — a record was already attached to it, and an account
 * that began by wiping that history would be worse than none.
 */
export async function redeemLink(
  env: Env,
  token: string,
  deviceToken: string | null,
  now: number,
): Promise<SignedIn | null> {
  const spent = await env.DB.prepare(
    "UPDATE magic_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
  )
    .bind(now, await hashToken(token), now)
    .run();
  if (spent.meta.changes === 0) {
    return null;
  }

  const row = await env.DB.prepare("SELECT email FROM magic_links WHERE token_hash = ?")
    .bind(await hashToken(token))
    .first<{ email: string }>();
  if (row === null) {
    return null;
  }

  const existing = await env.DB.prepare("SELECT id FROM accounts WHERE email = ?")
    .bind(row.email)
    .first<{ id: string }>();

  const accountId = existing?.id ?? crypto.randomUUID();
  if (existing === null) {
    await env.DB.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
      .bind(accountId, row.email, now)
      .run();
  }

  if (deviceToken !== null && deviceToken !== "") {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO account_tokens (token, account_id, claimed_at) VALUES (?, ?, ?)",
    )
      .bind(deviceToken, accountId, now)
      .run();
  }

  return { accountId, email: row.email, session: await signSession(accountId, env, now) };
}

/**
 * Hands the link to Resend.
 *
 * The address must be at the domain Resend has verified, which is the bare
 * `ericonice.com`. This was first written as `play@send.ericonice.com`, on the
 * reasoning that a subdomain keeps the game's sending reputation separate — but
 * the `send.` records Resend asks for are the parent domain's return path and
 * SPF, not a domain in their own right, and sending from one is a flat 403.
 * Making it real would mean verifying `send.ericonice.com` separately, and the
 * free plan verifies one domain.
 */
async function sendMagicLink(env: Env, email: string, link: string): Promise<boolean> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Honeymoon Bridge <play@ericonice.com>",
      to: [email],
      subject: "Your sign-in link",
      text: [
        "Tap the link below to sign in to Honeymoon Bridge.",
        "",
        link,
        "",
        "It works once and expires in ten minutes.",
        "If you did not ask for this, nothing has happened — ignore it.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    // Logged rather than thrown: the caller says the same thing to the browser
    // whatever happened, and a failure to send is a thing to go and read.
    console.error("resend rejected the message", response.status, await response.text());
  }
  return response.ok;
}
