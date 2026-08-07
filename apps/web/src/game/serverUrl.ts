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

export function setLocationCode(code: string | null): void {
  const next = code === null ? " " : `#/table/${code}`;
  history.replaceState(null, "", code === null ? window.location.pathname : next);
}
