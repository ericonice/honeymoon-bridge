import type { MatchFormat } from "@hb/engine";
import {
  accountFor,
  isPlaytester,
  accountFromRequest,
  normalizeCode,
  normalizeDestination,
  normalizeEmail,
  normalizeName,
  redeemCode,
  redeemLink,
  requestLink,
  setAccountName,
  signInAs,
} from "./auth.js";
import { inviteCode, isInviteCode } from "./codes.js";
import type { Env } from "./env.js";
import { recentMatchesFor, recordRubber, recordsFor, resetRecord, ROBOT_TOKEN } from "./results.js";

export { Lobby } from "./lobby.js";
export { Table } from "./table.js";

/**
 * Where the game is allowed to be played from.
 *
 * An open API is an open API: this keeps a table to the app it belongs to
 * rather than to anything that can reach the internet. It matters more now that
 * there are accounts behind it than it did when there was nothing to steal.
 *
 * The pattern covers the site's own domain and any subdomain of it, so moving
 * the app from `pages.dev` to a real address needs no redeploy of the server.
 * It is anchored at both ends — an unanchored match would also accept
 * `ericonice.com.attacker.example`.
 */
const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?ericonice\.com$/;

const ALLOWED_EXACT = [
  "https://honeymoon-bridge.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  if (!ALLOWED_EXACT.includes(origin) && !ALLOWED_ORIGIN.test(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    // Authorization belongs here because the session check sends one. A browser
    // asks permission for that header before the request goes anywhere, and a
    // list without it fails the preflight rather than the request — so signing
    // in appears to work and the app still cannot tell who you are. Nothing
    // outside a browser does this, which is why every script said it was fine.
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    // A day, so the check does not cost a round trip every time.
    "Access-Control-Max-Age": "86400",
  };
}

function json(
  request: Request,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request), ...headers },
  });
}

interface RobotRubber {
  readonly deals: number;
  readonly deviceToken: string;
  readonly format: MatchFormat;
  readonly nickname: string;
  readonly botVersion: number | null;
  readonly points: number;
  readonly pointsAgainst: number;
  readonly won: boolean;
}

/**
 * Reads a reported robot rubber, or nothing.
 *
 * The numbers cannot be verified — no server saw the game — but they can be
 * made to be numbers. Bounds are generous rather than tight: a long rubber is a
 * real thing, and the point is to keep the table free of values that would make
 * a scoreboard meaningless, not to pretend this is proof of anything.
 */
function robotRubberFrom(body: unknown): RobotRubber | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const value = body as Record<string, unknown>;
  const whole = (input: unknown, limit: number): number | null =>
    typeof input === "number" && Number.isInteger(input) && input >= 0 && input <= limit
      ? input
      : null;

  const deals = whole(value.deals, 500);
  const points = whole(value.points, 100_000);
  const pointsAgainst = whole(value.pointsAgainst, 100_000);
  if (deals === null || deals === 0 || points === null || pointsAgainst === null) {
    return null;
  }
  if (typeof value.deviceToken !== "string" || value.deviceToken === "") {
    return null;
  }
  if (typeof value.won !== "boolean") {
    return null;
  }

  const nickname = typeof value.nickname === "string" ? value.nickname.slice(0, 20) : "";
  return {
    // Null from a client too old to name which bot it played. That is not the
    // same as version zero and must not be recorded as one — it means the game
    // predates the question being asked.
    botVersion: whole(value.botVersion, 1000),
    deals,
    deviceToken: value.deviceToken,
    // Anything unrecognized is a rubber, which is what a client too old to know
    // about formats would have been playing.
    format: value.format === "game" ? "game" : "rubber",
    nickname: nickname === "" ? "Player" : nickname,
    points,
    pointsAgainst,
    won: value.won,
  };
}

/** How long to wait, in words, for a message somebody is about to read. */
function retryPhrase(seconds: number): string {
  if (seconds <= 60) {
    return "in under a minute";
  }
  const minutes = Math.ceil(seconds / 60);
  return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
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
    //
    // Behind a session because a table is a place to play a person, and §3.7
    // requires an account for that. Refusing here rather than at the socket
    // means somebody is turned away before they have a code to share.
    if (request.method === "POST" && url.pathname === "/api/tables") {
      if ((await accountFromRequest(request, env, Date.now())) === null) {
        return json(request, { error: "Sign in to start a table" }, 401);
      }
      return json(request, { code: inviteCode() }, 201);
    }

    if (url.pathname === "/api/auth/request" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        email?: unknown;
        standalone?: unknown;
        to?: unknown;
      };
      const email = normalizeEmail(body.email);
      // The origin the request came from, so a link opened on the phone lands
      // on the same deployment the phone is already using.
      const appOrigin = request.headers.get("Origin") ?? "https://honeymoon-bridge.ericonice.com";
      const requested =
        email === null
          ? null
          : await requestLink(env, {
              appOrigin,
              destination: normalizeDestination(body.to),
              email,
              ip: request.headers.get("CF-Connecting-IP"),
              now: Date.now(),
              standalone: body.standalone === true,
            });

      // Failing to send is a fault on this side rather than a fact about the
      // address, so saying so reveals nothing — and it is the difference between
      // a player who tries again and one who waits for an email that was never
      // going to arrive. Every message here was silently rejected for a while
      // because this answered "ok" no matter what happened.
      if (requested?.kind === "send-failed") {
        return json(request, { error: "Could not send the email just now." }, 502);
      }

      // Being turned away for asking too often is also worth saying out loud. It
      // does admit that the address has asked recently, which is a small thing to
      // give up — but staying quiet means the app claims a link is coming when it
      // is not, and that is indistinguishable from mail going missing. Somebody
      // told to wait a minute can wait a minute.
      if (requested?.kind === "rate-limited") {
        const seconds = Math.ceil(requested.retryAfterMs / 1000);
        return json(
          request,
          { error: `Too many sign-in links asked for. Try again ${retryPhrase(seconds)}.` },
          429,
          { "Retry-After": String(seconds) },
        );
      }

      // Otherwise the same answer whatever happened. Whether an address has an
      // account here is still not something a stranger gets to find out by asking.
      return json(request, { ok: true });
    }

    if (url.pathname === "/api/auth/verify" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        deviceToken?: unknown;
        token?: unknown;
      };
      if (typeof body.token !== "string") {
        return json(request, { error: "That link is not valid" }, 400);
      }
      const deviceToken = typeof body.deviceToken === "string" ? body.deviceToken : null;
      const signedIn = await redeemLink(env, body.token, deviceToken, Date.now());
      if (signedIn === null) {
        return json(request, { error: "That link has expired or has already been used" }, 400);
      }
      return json(request, {
        email: signedIn.email,
        name: signedIn.name,
        session: signedIn.session,
      });
    }

    // Signing in by typing the code from the email into whichever app asked.
    //
    // This is the path that works on a phone with the app installed: iOS gives
    // a home-screen app its own storage, so a link opened from Mail signs
    // Safari in and leaves the app untouched, with the link then spent. A code
    // goes the other way — it is carried *into* the app by the person.
    if (url.pathname === "/api/auth/code" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        code?: unknown;
        deviceToken?: unknown;
        email?: unknown;
      };
      const code = normalizeCode(body.code);
      const email = normalizeEmail(body.email);
      if (code === null || email === null) {
        return json(request, { error: "That code is not valid" }, 400);
      }
      const signedIn = await redeemCode(env, {
        code,
        deviceToken: typeof body.deviceToken === "string" ? body.deviceToken : null,
        email,
        now: Date.now(),
      });
      // Deliberately the same answer for a wrong code, an expired one and an
      // address that never asked. Which of those it was is not something a
      // stranger gets to learn by trying.
      if (signedIn === null) {
        return json(request, { error: "That code has expired or has already been used" }, 400);
      }
      return json(request, {
        email: signedIn.email,
        name: signedIn.name,
        session: signedIn.session,
      });
    }

    // Signing in without the email round trip, for the development loop only.
    //
    // Two-player testing is a window and an incognito window, and incognito
    // forgets its session every time it closes — so with a gate in front of
    // networked play, the ordinary loop would cost two sign-in emails per run
    // (§3.6). This is the one dev control that cannot ship: the others are safe
    // in production precisely because the server refuses them, and refusing
    // this one would defeat it.
    //
    // `DEV_SIGNIN` is set by the `dev` script and by nothing else. A deployed
    // Worker has no such variable, so this is a 404 there — and a 404 rather
    // than a 403, because a route that says "forbidden" has admitted it exists.
    if (url.pathname === "/api/auth/dev" && request.method === "POST") {
      if (env.DEV_SIGNIN !== "1") {
        return json(request, { error: "Not found" }, 404);
      }
      const body = (await request.json().catch(() => ({}))) as {
        deviceToken?: unknown;
        email?: unknown;
      };
      const email = normalizeEmail(body.email);
      if (email === null) {
        return json(request, { error: "That is not an address" }, 400);
      }
      const signedIn = await signInAs(env, {
        deviceToken: typeof body.deviceToken === "string" ? body.deviceToken : null,
        email,
        now: Date.now(),
      });
      return json(request, {
        email: signedIn.email,
        name: signedIn.name,
        session: signedIn.session,
      });
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const accountId = await accountFromRequest(request, env, Date.now());
      const account = accountId === null ? null : await accountFor(env, accountId);
      // Sent as a plain flag rather than the list: the client needs to know
      // whether to show the rows, and never needs to know who else can.
      return json(request, {
        account,
        playtester: account !== null && isPlaytester(env, account.email),
      });
    }

    // Setting the name somebody is known by. It is on the account rather than
    // on the device because it is shown to whoever they play and kept on every
    // result they appear in — a name that changed with the browser would make
    // both of those lie.
    if (url.pathname === "/api/auth/name" && request.method === "POST") {
      const accountId = await accountFromRequest(request, env, Date.now());
      if (accountId === null) {
        return json(request, { error: "Not signed in" }, 401);
      }
      const body = (await request.json().catch(() => ({}))) as { name?: unknown };
      const name = normalizeName(body.name);
      if (name === null) {
        return json(request, { error: "That is not a name" }, 400);
      }
      await setAccountName(env, accountId, name);
      return json(request, { name });
    }

    // Your record against everyone you have finished a rubber against. Behind a
    // session because it is the one thing here that is nobody else's business:
    // who somebody plays and how they do against them.
    if (url.pathname === "/api/results" && request.method === "GET") {
      const accountId = await accountFromRequest(request, env, Date.now());
      if (accountId === null) {
        return json(request, { error: "Not signed in" }, 401);
      }
      return json(request, await recordsFor(env, accountId));
    }

    // The individual matches behind that record, newest first — the record
    // above tallies by opponent, which cannot say what was played or when.
    if (url.pathname === "/api/results/recent" && request.method === "GET") {
      const accountId = await accountFromRequest(request, env, Date.now());
      if (accountId === null) {
        return json(request, { error: "Not signed in" }, 401);
      }
      return json(request, { matches: await recentMatchesFor(env, accountId, 20) });
    }

    // Forgetting your own record. Deliberately does not take anything away
    // from the person on the other side of it — see `resetRecord`.
    if (url.pathname === "/api/results/reset" && request.method === "POST") {
      const accountId = await accountFromRequest(request, env, Date.now());
      if (accountId === null) {
        return json(request, { error: "Not signed in" }, 401);
      }
      return json(request, { forgotten: await resetRecord(env, accountId) });
    }

    // A rubber against the computer, reported by the browser that played it.
    //
    // Unlike a networked rubber there is no server in the loop — the game runs
    // wholly on the device (§2.1) — so this is taken on the client's word and
    // cannot be otherwise. It is kept in its own section of the record for that
    // reason rather than added to games against people.
    if (url.pathname === "/api/results/robot" && request.method === "POST") {
      const reported = await request.json().catch(() => null);
      const rubber = robotRubberFrom(reported);
      if (rubber === null) {
        return json(request, { error: "Not a result" }, 400);
      }

      const accountId = await accountFromRequest(request, env, Date.now());
      // A signed-in player is known by their account's name, the same as at a
      // table. The reported one is only for somebody who has never signed in,
      // whose robot rubbers are attached to the device until they do.
      const account = accountId === null ? null : await accountFor(env, accountId);

      await recordRubber(
        env,
        {
          botVersion: rubber.botVersion,
          code: "ROBOT",
          deals: rubber.deals,
          format: rubber.format,
          seats: [
            {
              accountId,
              nickname: account?.name ?? rubber.nickname,
              points: rubber.points,
              token: rubber.deviceToken,
            },
            {
              accountId: null,
              nickname: "Computer",
              points: rubber.pointsAgainst,
              token: ROBOT_TOKEN,
            },
          ],
          winner: rubber.won ? 0 : 1,
        },
        Date.now(),
      );
      return json(request, { ok: true }, 201);
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
