import { inviteCode, isInviteCode } from "./codes.js";
import type { Env } from "./env.js";

export { Lobby } from "./lobby.js";
export { Table } from "./table.js";

/**
 * Where the game is allowed to be played from.
 *
 * There are no accounts and nothing to steal, but an open API is still an open
 * API: this keeps a table to the app it belongs to rather than to anything that
 * can reach the internet.
 */
const ALLOWED_ORIGINS = [
  "https://honeymoon-bridge.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

/**
 * Two routes and nothing else.
 *
 * There is no lobby, no discovery and no listing — §2.2 is explicit that a
 * table is reached by an invite someone sent you. A route that could enumerate
 * tables would be the only way to find a stranger's game, so there isn't one.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Creating a table is just minting a code: the Durable Object it names is
    // brought into being by the first player to connect to it.
    if (request.method === "POST" && url.pathname === "/api/tables") {
      return json(request, { code: inviteCode() }, 201);
    }

    // The queue. One object for everyone, since matchmaking is the one thing
    // here that cannot be split up by table.
    if (url.pathname === "/api/queue/ws") {
      const id = env.LOBBY.idFromName("lobby");
      // Rebuilt rather than forwarded: a Request that has already been routed
      // cannot be handed to a Durable Object stub as-is.
      return env.LOBBY.get(id).fetch(new Request(`${url.origin}/`, request));
    }

    const match = /^\/api\/tables\/([^/]+)\/ws$/.exec(url.pathname);
    if (match !== null) {
      const code = match[1]!.toUpperCase();
      if (!isInviteCode(code)) {
        return json(request, { error: "Not a table code" }, 404);
      }
      // The code names the object. One table, one Durable Object, no routing.
      const id = env.TABLES.idFromName(code);
      return env.TABLES.get(id).fetch(new Request(`${url.origin}/?code=${code}`, request));
    }

    return json(request, { error: "Not found" }, 404);
  },
};
