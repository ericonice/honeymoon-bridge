/**
 * Where the table server lives.
 *
 * Set `VITE_SERVER_ORIGIN` to point a build at a deployed Worker. The default
 * is the local `wrangler dev`, so the networked game works out of the box while
 * developing and has to be configured deliberately to reach anything else.
 */
const ORIGIN: string =
  import.meta.env.VITE_SERVER_ORIGIN !== undefined && import.meta.env.VITE_SERVER_ORIGIN !== ""
    ? import.meta.env.VITE_SERVER_ORIGIN
    : "http://127.0.0.1:8787";

export function serverConfigured(): boolean {
  return ORIGIN !== "";
}

export function createTableUrl(): string {
  return `${ORIGIN}/api/tables`;
}

export function authUrl(action: "code" | "dev" | "me" | "name" | "request" | "verify"): string {
  return `${ORIGIN}/api/auth/${action}`;
}

export function recordsUrl(): string {
  return `${ORIGIN}/api/results`;
}

export function recentMatchesUrl(): string {
  return `${ORIGIN}/api/results/recent`;
}

export function resetRecordUrl(): string {
  return `${ORIGIN}/api/results/reset`;
}

export function robotResultUrl(): string {
  return `${ORIGIN}/api/results/robot`;
}

export function tableSocketUrl(code: string): string {
  // Same origin, other scheme: ws for http, wss for https.
  return `${ORIGIN.replace(/^http/, "ws")}/api/tables/${code}/ws`;
}

export function queueSocketUrl(): string {
  return `${ORIGIN.replace(/^http/, "ws")}/api/queue/ws`;
}

/** The link to send someone, which is this app with the code in the hash. */
export function inviteLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}#/table/${code}`;
}

/** The code in the current URL, if this page was opened from an invite. */
export function codeFromLocation(): string | null {
  const match = /^#\/table\/([^/]+)$/.exec(window.location.hash);
  return match === null ? null : match[1]!.toUpperCase();
}

/**
 * The sign-in link this page was opened from, if it was.
 *
 * The token is left exactly as it was sent, unlike a table code: this is
 * base64url, so case is part of the value rather than presentation. `to` is
 * where the person was going before they were asked to sign in, which the
 * server put in the link — see `destination.ts` for why it is not enough to
 * keep that on the device that asked.
 */
export function signInFromLocation(): { readonly to: string | null; readonly token: string } | null {
  const match = /^#\/signin\/([A-Za-z0-9_-]+)(?:\?to=(.*))?$/.exec(window.location.hash);
  if (match === null) {
    return null;
  }
  const to = match[2];
  return { to: to === undefined ? null : decodeURIComponent(to), token: match[1]! };
}

/**
 * Takes the hash back off the URL.
 *
 * Worth doing the moment a sign-in link has been spent: leaving it there means a
 * refresh retries a token that now cannot work, and the honest report of that is
 * indistinguishable from the link having genuinely gone stale.
 */
export function clearLocationHash(): void {
  history.replaceState(null, "", window.location.pathname);
}

export function setLocationCode(code: string | null): void {
  if (code === null) {
    clearLocationHash();
    return;
  }
  history.replaceState(null, "", `#/table/${code}`);
}
