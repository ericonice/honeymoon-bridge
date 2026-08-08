import { isInviteCode, signInCode } from "./codes.js";
import type { Env } from "./env.js";

/** How long a sign-in link stays usable. Long enough to switch to an inbox, no longer. */
const LINK_TTL_MS = 10 * 60 * 1000;

/** How long a session lasts. Signing in should be a thing you do once per device. */
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Outstanding links per address before we stop sending.
 *
 * This was five, sized as a brake on a convenience. It is now what stands
 * between somebody and a game, so it is loose enough to absorb a person who
 * taps "send again" twice because nothing arrived. That person is not the
 * threat, and locking them out costs them the evening rather than a login.
 */
const MAX_PENDING_LINKS = 10;
const RATE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Links per origin before we stop sending, which is the limit that guards the
 * send quota.
 *
 * The per-address limit never did: a script uses a different address every time
 * and trips nothing. Generous enough that a household behind one address is
 * nowhere near it.
 */
const MAX_LINKS_PER_IP = 40;
const IP_WINDOW_MS = 60 * 60 * 1000;

/** The longest a display name may be, matching what the name field accepts. */
const MAX_NAME_LENGTH = 20;

/**
 * Wrong codes before every outstanding one for that address is burned.
 *
 * A six-character code out of a thirty-one character alphabet is around 900
 * million, which is plenty against five guesses and nowhere near enough without
 * a limit. Burning them rather than locking the address out keeps the remedy in
 * the person's hands: ask for another.
 */
const MAX_CODE_ATTEMPTS = 5;

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

/**
 * A display name, or null if it is not one.
 *
 * Trimmed and capped rather than validated: this is what somebody wants to be
 * called, and the only genuinely wrong answers are nothing at all and something
 * too long to fit beside a hand of cards.
 */
export function normaliseName(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const name = raw.trim().slice(0, MAX_NAME_LENGTH);
  return name === "" ? null : name;
}

/**
 * Where a sign-in link should land, or null for the home screen.
 *
 * The destination travels in the link because the browser that opens the mail
 * is often not the one that asked — an invite would otherwise be lost to the
 * round trip it now requires. That makes it a value from outside deciding where
 * somebody goes after authenticating, so it is matched against the two shapes
 * that exist rather than sanitised: an open redirect built out of a hash is
 * still an open redirect.
 */
export function normaliseDestination(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  if (raw === "queue") {
    return "queue";
  }
  const table = /^table\/([^/]+)$/.exec(raw);
  const code = table?.[1]?.toUpperCase();
  return code !== undefined && isInviteCode(code) ? `table/${code}` : null;
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

interface Window {
  readonly count: number;
  readonly oldestAt: number | null;
}

/** The links outstanding for an address, and when the oldest stops counting. */
async function pendingLinks(env: Env, email: string, now: number): Promise<Window> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS pending, MIN(created_at) AS oldest FROM magic_links WHERE email = ? AND used_at IS NULL AND created_at > ?",
  )
    .bind(email, now - RATE_WINDOW_MS)
    .first<{ oldest: number | null; pending: number }>();
  return { count: row?.pending ?? 0, oldestAt: row?.oldest ?? null };
}

/**
 * The links sent from an address in the last hour, used or not.
 *
 * Unlike the per-address window this counts spent links too, because what it
 * protects is the send quota and a link that was used cost exactly as much to
 * send as one that was not.
 */
async function linksFromIp(env: Env, ip: string, now: number): Promise<Window> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS pending, MIN(created_at) AS oldest FROM magic_links WHERE requested_ip = ? AND created_at > ?",
  )
    .bind(ip, now - IP_WINDOW_MS)
    .first<{ oldest: number | null; pending: number }>();
  return { count: row?.pending ?? 0, oldestAt: row?.oldest ?? null };
}

/** How long until the window has room again. */
function retryAfterMs(window: Window, windowMs: number, now: number): number {
  return window.oldestAt === null ? windowMs : Math.max(0, window.oldestAt + windowMs - now);
}

export type LinkRequest =
  | { readonly kind: "rate-limited"; readonly retryAfterMs: number }
  | { readonly kind: "send-failed" }
  | { readonly kind: "sent" };

export interface LinkOptions {
  readonly appOrigin: string;
  readonly destination: string | null;
  readonly email: string;
  readonly ip: string | null;
  readonly now: number;
  /**
   * Whether the app asking is a home-screen install rather than a browser tab.
   *
   * It changes what gets sent. A link in an email opened on iOS goes to Safari,
   * which has its own storage — so for an installed app the link does not sign
   * *it* in, it signs Safari in and leaves the app untouched. Sending one
   * anyway would be sending the wrong thing to tap, so a standalone request
   * gets the code alone.
   */
  readonly standalone: boolean;
}

/**
 * The link that gets mailed.
 *
 * The destination rides along so that a link opened somewhere other than the
 * browser that asked for it still knows where the person was going. It sits
 * after the token rather than before it so the token stays the first thing the
 * client reads, and both halves live inside the fragment — a fragment is never
 * sent to the server, and a live sign-in token has no business in anybody's
 * request logs.
 */
export function signInUrl(options: {
  readonly appOrigin: string;
  readonly destination: string | null;
  readonly token: string;
}): string {
  const { appOrigin, destination, token } = options;
  const to = destination === null ? "" : `?to=${encodeURIComponent(destination)}`;
  return `${appOrigin}/#/signin/${token}${to}`;
}

/**
 * Issues a sign-in link.
 *
 * The link itself never leaves this function. It goes to the address or it goes
 * nowhere — a caller that could see it would be one more place for a live
 * credential to end up.
 */
export async function requestLink(env: Env, options: LinkOptions): Promise<LinkRequest> {
  const { appOrigin, destination, email, ip, now, standalone } = options;

  const pending = await pendingLinks(env, email, now);
  if (pending.count >= MAX_PENDING_LINKS) {
    return { kind: "rate-limited", retryAfterMs: retryAfterMs(pending, RATE_WINDOW_MS, now) };
  }

  if (ip !== null) {
    const fromIp = await linksFromIp(env, ip, now);
    if (fromIp.count >= MAX_LINKS_PER_IP) {
      return { kind: "rate-limited", retryAfterMs: retryAfterMs(fromIp, IP_WINDOW_MS, now) };
    }
  }

  const token = newToken();
  const tokenHash = await hashToken(token);
  const code = signInCode();
  await env.DB.prepare(
    "INSERT INTO magic_links (token_hash, email, expires_at, created_at, requested_ip, code_hash) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(tokenHash, email, now + LINK_TTL_MS, now, ip, await hashToken(code))
    .run();

  const sent = await sendMagicLink(env, email, {
    code,
    // No link at all for an installed app: it would open in Safari and sign in
    // the wrong storage, which is worse than not offering it.
    link: standalone ? null : signInUrl({ appOrigin, destination, token }),
  });

  if (!sent) {
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
  /** Null until they have been asked, which is the first thing after signing in. */
  readonly name: string | null;
  readonly session: string;
}

export interface Account {
  readonly email: string;
  readonly name: string | null;
}

export async function accountFor(env: Env, accountId: string): Promise<Account | null> {
  const row = await env.DB.prepare("SELECT email, name FROM accounts WHERE id = ?")
    .bind(accountId)
    .first<{ email: string; name: string | null }>();
  return row === null ? null : { email: row.email, name: row.name };
}

export async function setAccountName(env: Env, accountId: string, name: string): Promise<void> {
  await env.DB.prepare("UPDATE accounts SET name = ? WHERE id = ?").bind(name, accountId).run();
}

/** The account a request's `Authorization` header proves it belongs to, or null. */
export async function accountFromRequest(
  request: Request,
  env: Env,
  now: number,
): Promise<string | null> {
  const header = request.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? verifySession(header.slice(7), env, now) : null;
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

  return signInAs(env, { deviceToken, email: row.email, now });
}

/** A typed code, as it was sent. Spaces and case are how people write, not part of it. */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  return isInviteCode(code) ? code : null;
}

/**
 * Spends a sign-in code, which is the same credential as the link in a shape
 * that can be carried between two apps.
 *
 * Scoped by address as well as by code. That is what makes six characters
 * enough: a guess has to arrive with the right address attached, and the
 * attempt counter burns the outstanding codes for that address after five
 * wrong ones.
 *
 * The count is incremented before the match rather than after a failure, so a
 * guess costs something whether or not it landed — otherwise the cheapest
 * attack is the one that never matches.
 */
export async function redeemCode(
  env: Env,
  options: {
    readonly code: string;
    readonly deviceToken: string | null;
    readonly email: string;
    readonly now: number;
  },
): Promise<SignedIn | null> {
  const { code, deviceToken, email, now } = options;

  await env.DB.prepare(
    "UPDATE magic_links SET attempts = attempts + 1 WHERE email = ? AND used_at IS NULL AND expires_at > ?",
  )
    .bind(email, now)
    .run();

  // The same statement that marks it used requires it to be unused, so two taps
  // cannot both succeed — exactly as for the link.
  const spent = await env.DB.prepare(
    `UPDATE magic_links SET used_at = ?
     WHERE email = ? AND code_hash = ? AND used_at IS NULL AND expires_at > ? AND attempts <= ?`,
  )
    .bind(now, email, await hashToken(code), now, MAX_CODE_ATTEMPTS)
    .run();

  if (spent.meta.changes === 0) {
    return null;
  }
  return signInAs(env, { deviceToken, email, now });
}

/**
 * Signs somebody in, having already established that the address is theirs.
 *
 * Split out from `redeemLink` because the development bypass (§3.6) needs
 * everything here and none of the link-spending above it. Nothing in this
 * function proves anything about who is asking, so its callers must — the two
 * proofs available are a link that arrived in an inbox and a server that is
 * running on somebody's laptop.
 */
export async function signInAs(
  env: Env,
  options: { readonly deviceToken: string | null; readonly email: string; readonly now: number },
): Promise<SignedIn> {
  const { deviceToken, email, now } = options;

  const existing = await env.DB.prepare("SELECT id, name FROM accounts WHERE email = ?")
    .bind(email)
    .first<{ id: string; name: string | null }>();

  const accountId = existing?.id ?? crypto.randomUUID();
  if (existing === null) {
    await env.DB.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
      .bind(accountId, email, now)
      .run();
  }

  if (deviceToken !== null && deviceToken !== "") {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO account_tokens (token, account_id, claimed_at) VALUES (?, ?, ?)",
    )
      .bind(deviceToken, accountId, now)
      .run();
  }

  return {
    accountId,
    email,
    name: existing?.name ?? null,
    session: await signSession(accountId, env, now),
  };
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
async function sendMagicLink(
  env: Env,
  email: string,
  what: { readonly code: string; readonly link: string | null },
): Promise<boolean> {
  // The code comes first even when there is a link, because it is the one that
  // always works. A link is a convenience on a desktop and a trap on a phone
  // with the app installed.
  const body =
    what.link === null
      ? [
          "Enter this code in Honeymoon Bridge to sign in:",
          "",
          `    ${what.code}`,
          "",
          "There is no link in this message on purpose. Opening one would sign in",
          "your browser rather than the app you asked from.",
        ]
      : [
          "Enter this code in Honeymoon Bridge to sign in:",
          "",
          `    ${what.code}`,
          "",
          "Or, if you asked from this device's browser, tap:",
          "",
          what.link,
        ];

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Honeymoon Bridge <play@ericonice.com>",
      to: [email],
      subject: `Your sign-in code: ${what.code}`,
      text: [
        ...body,
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
