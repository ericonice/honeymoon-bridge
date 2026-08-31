import type { Contract, DealFacts, MatchFormat, Pair, PlayerId, RubberFacts, Tier } from "@hb/engine";
import { achievementsFor, applyDealAchievements, applyRubberAchievements } from "./achievements.js";
import {
  accountFor,
  isPlaytester,
  accountFromRequest,
  deleteAccount,
  normalizeCode,
  normalizeDestination,
  normalizeEmail,
  normalizeName,
  redeemCode,
  redeemLink,
  requestLink,
  setAccountName,
  setHideFromLeaderboard,
  signInAs,
} from "./auth.js";
import { inviteCode, isInviteCode } from "./codes.js";
import type { Env } from "./env.js";
import { handLogsFor, recordHandLog } from "./handLogs.js";
import type { HandLog } from "./handLogs.js";
import { botAnchors } from "./ratings.js";
import {
  DRAWN,
  everyRecentMatch,
  recentMatchesFor,
  recordRubber,
  recordsFor,
  resetRecord,
  ROBOT_TOKEN,
} from "./results.js";
import { standingsFor } from "./standings.js";

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
  // The Capacitor iOS shell: a WKWebView loading the bundle from disk sends this
  // as its Origin, not the site's real origin, since nothing was fetched over
  // HTTP to get there. Every authenticated request is preflighted, so without
  // this every one of them fails closed with no error visible on the client.
  "capacitor://localhost",
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
  readonly drawn: boolean;
  readonly format: MatchFormat;
  readonly nickname: string;
  readonly botVersion: number | null;
  /** Which rung it was set to play at, or null from a build that has no setting. */
  readonly difficulty: string | null;
  readonly points: number;
  readonly pointsAgainst: number;
  /** Played on the boards of the match before it, from the other side. */
  readonly repeated: boolean;
  /**
   * When the rubber ended on the client, or null from a build that does not say.
   * Trusted only within `REPORT_WINDOW` of now — see `playedAt`.
   */
  readonly finishedAt: number | null;
  readonly won: boolean;
}

/**
 * How far from now a client's own timestamp is taken at face value.
 *
 * A queued report can be days late, so its own idea of when the game ended is
 * better than the moment it arrives — but it is also a number the client chose,
 * and a rubber stamped in 2019 or next year would sort wrongly forever in a
 * rating that walks the history in order. Outside the window, the arrival time is
 * the honest answer: late, but real.
 */
const REPORT_WINDOW = 30 * 24 * 60 * 60 * 1000;

/** When to say a reported rubber was played. */
function playedAt(reported: number | null, now: number): number {
  if (reported === null || reported > now + 60_000 || reported < now - REPORT_WINDOW) {
    return now;
  }
  return reported;
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
  // When the rubber actually ended, which is not when this arrives: the client
  // queues a report and retries, so a delivery timestamp can be days late. Kept
  // optional for the older builds the service worker keeps in circulation.
  const finishedAt =
    typeof value.finishedAt === "number" && Number.isInteger(value.finishedAt)
      ? value.finishedAt
      : null;
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
    finishedAt,
    // Null from a client too old to name which bot it played. That is not the
    // same as version zero and must not be recorded as one — it means the game
    // predates the question being asked.
    botVersion: whole(value.botVersion, 1000),
    deals,
    // Stored as the client sent it rather than checked against a list of rungs.
    // A rung this build has never heard of is a client deployed ahead of the
    // server, which the service worker makes routine — and recording it raw lets
    // `ratings.ts` decide what it is worth *and* come out right by itself once
    // the server learns the name, where dropping it to null would silently rate
    // the match at the top rung and never correct.
    difficulty: rung(value.difficulty),
    deviceToken: value.deviceToken,
    // Anything unrecognized is a rubber, which is what a client too old to know
    // about formats would have been playing. Duplicate is stored on the same
    // terms as an unrecognised difficulty rung: keep what the client said, so
    // `ratings.ts` can come out right by itself once it learns what to do with
    // it, rather than flattening it to something it is not.
    format:
      value.format === "game" || value.format === "duplicate" || value.format === "mirror"
        ? value.format
        : "rubber",
    nickname: nickname === "" ? "Player" : nickname,
    points,
    pointsAgainst,
    // Optional and additive, because every client the service worker still has in
    // circulation sends `won` alone and never a draw. Absent means somebody won,
    // which is what a client that could not draw was reporting.
    drawn: value.drawn === true,
    // Same terms as `drawn`: additive and absent-means-no, because a client old
    // enough not to send it could not play a return match in the first place.
    repeated: value.repeated === true,
    won: value.won,
  };
}

/**
 * A difficulty rung as a slug, or null.
 *
 * Bounded and narrowed to the alphabet a rung name uses, because this string is
 * stored and later read back as a key. Not validated against the known rungs —
 * see where it is used.
 */
function rung(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const slug = input.slice(0, 20).toLowerCase();
  return /^[a-z]+$/.test(slug) ? slug : null;
}

function tierOrNull(input: unknown): Tier | null | undefined {
  if (input === null || input === "bronze" || input === "silver" || input === "gold") {
    return input;
  }
  return undefined;
}

function tierPair(input: unknown): Pair<Tier | null> | null {
  if (!Array.isArray(input) || input.length !== 2) {
    return null;
  }
  const a = tierOrNull(input[0]);
  const b = tierOrNull(input[1]);
  return a === undefined || b === undefined ? null : [a, b];
}

function boolPair(input: unknown): Pair<boolean> | null {
  if (
    !Array.isArray(input) ||
    input.length !== 2 ||
    typeof input[0] !== "boolean" ||
    typeof input[1] !== "boolean"
  ) {
    return null;
  }
  return [input[0], input[1]];
}

/** A per-player count from a single deal: at most one per draw turn, thirteen turns each. */
function countPair(input: unknown): Pair<number> | null {
  const valid = (n: unknown): n is number =>
    typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 13;
  if (!Array.isArray(input) || input.length !== 2 || !valid(input[0]) || !valid(input[1])) {
    return null;
  }
  return [input[0], input[1]];
}

function playerId(input: unknown): PlayerId | null {
  return input === 0 || input === 1 ? input : null;
}

function playerIdOrNull(input: unknown): PlayerId | null | undefined {
  if (input === null) {
    return null;
  }
  return input === 0 || input === 1 ? input : undefined;
}

function handsPlayedOrNull(input: unknown): number | null | undefined {
  if (input === null) {
    return null;
  }
  return typeof input === "number" && Number.isInteger(input) && input >= 0 ? input : undefined;
}

/**
 * Reads a reported deal's achievement facts, or nothing.
 *
 * Taken on the client's word for a robot game, same as `robotRubberFrom` — the
 * shape is bounded and typed, not verified, since nothing here saw the deal.
 */
function dealFactsFrom(body: unknown): { facts: DealFacts; player: PlayerId } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const value = body as Record<string, unknown>;
  const player = playerId(value.player);
  const raw = value.facts;
  if (player === null || typeof raw !== "object" || raw === null) {
    return null;
  }
  const f = raw as Record<string, unknown>;

  const handWonBy = playerIdOrNull(f.handWonBy);
  const insultTier = tierPair(f.insultTier);
  const rejections = countPair(f.rejections);
  const setTier = tierPair(f.setTier);
  const slamTier = tierPair(f.slamTier);
  const twoSuited = boolPair(f.twoSuited);
  if (
    handWonBy === undefined ||
    insultTier === null ||
    rejections === null ||
    setTier === null ||
    slamTier === null ||
    twoSuited === null ||
    typeof f.nobodyWantedIt !== "boolean"
  ) {
    return null;
  }

  return {
    facts: {
      handWonBy,
      insultTier,
      nobodyWantedIt: f.nobodyWantedIt,
      rejections,
      setTier,
      slamTier,
      twoSuited,
    },
    player,
  };
}

/** Reads a reported rubber's achievement facts, or nothing. Same trust model as `dealFactsFrom`. */
function rubberFactsFrom(body: unknown): { facts: RubberFacts; player: PlayerId } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const value = body as Record<string, unknown>;
  const player = playerId(value.player);
  const raw = value.facts;
  if (player === null || typeof raw !== "object" || raw === null) {
    return null;
  }
  const f = raw as Record<string, unknown>;

  const comebackWinner = playerIdOrNull(f.comebackWinner);
  const handsPlayed = handsPlayedOrNull(f.handsPlayed);
  const sweepWinner = playerIdOrNull(f.sweepWinner);
  const wonRubber = playerIdOrNull(f.wonRubber);
  if (
    comebackWinner === undefined ||
    handsPlayed === undefined ||
    sweepWinner === undefined ||
    wonRubber === undefined
  ) {
    return null;
  }

  return { facts: { comebackWinner, handsPlayed, sweepWinner, wonRubber }, player };
}

const SUITS = new Set(["C", "D", "H", "S"]);
const STRAINS = new Set(["C", "D", "H", "S", "NT"]);
const DOUBLINGS = new Set(["none", "doubled", "redoubled"]);

function cardOrNull(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = input as Record<string, unknown>;
  const rank = value.rank;
  if (
    typeof rank !== "number" ||
    !Number.isInteger(rank) ||
    rank < 2 ||
    rank > 14 ||
    typeof value.suit !== "string" ||
    !SUITS.has(value.suit)
  ) {
    return undefined;
  }
  return { rank, suit: value.suit };
}

function handOrNull(input: unknown): unknown {
  if (!Array.isArray(input) || input.length !== 13) {
    return undefined;
  }
  const cards = input.map(cardOrNull);
  return cards.some((card) => card === undefined) ? undefined : cards;
}

function callOrNull(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = input as Record<string, unknown>;
  if (value.type === "pass" || value.type === "double" || value.type === "redouble") {
    return { type: value.type };
  }
  if (value.type === "bid" && typeof value.bid === "object" && value.bid !== null) {
    const bid = value.bid as Record<string, unknown>;
    if (
      typeof bid.level === "number" &&
      Number.isInteger(bid.level) &&
      bid.level >= 1 &&
      bid.level <= 7 &&
      typeof bid.strain === "string" &&
      STRAINS.has(bid.strain)
    ) {
      return { type: "bid", bid: { level: bid.level, strain: bid.strain } };
    }
  }
  return undefined;
}

/** At most one call a turn, and this game's auction is never anywhere near this long. */
const MAX_AUCTION_LENGTH = 200;

function auctionOrNull(input: unknown): unknown {
  if (!Array.isArray(input) || input.length > MAX_AUCTION_LENGTH) {
    return undefined;
  }
  const entries = input.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return undefined;
    }
    const value = entry as Record<string, unknown>;
    const by = playerId(value.by);
    const call = callOrNull(value.call);
    return by === null || call === undefined ? undefined : { by, call };
  });
  return entries.some((entry) => entry === undefined) ? undefined : entries;
}

function contractOrNull(input: unknown): Contract | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = input as Record<string, unknown>;
  const declarer = playerId(value.declarer);
  if (
    declarer === null ||
    typeof value.doubling !== "string" ||
    !DOUBLINGS.has(value.doubling) ||
    typeof value.level !== "number" ||
    !Number.isInteger(value.level) ||
    value.level < 1 ||
    value.level > 7 ||
    typeof value.strain !== "string" ||
    !STRAINS.has(value.strain)
  ) {
    return undefined;
  }
  return {
    declarer,
    doubling: value.doubling as Contract["doubling"],
    level: value.level as Contract["level"],
    strain: value.strain as Contract["strain"],
  };
}

/** A trick is two cards here, never four — see `REQUIREMENTS.md` §1. */
function completedTricksOrNull(input: unknown): unknown {
  if (!Array.isArray(input) || input.length > 13) {
    return undefined;
  }
  const tricks = input.map((trick) => {
    if (typeof trick !== "object" || trick === null) {
      return undefined;
    }
    const value = trick as Record<string, unknown>;
    const leader = playerId(value.leader);
    const winner = playerId(value.winner);
    if (leader === null || winner === null || !Array.isArray(value.cards) || value.cards.length > 2) {
      return undefined;
    }
    const cards = value.cards.map((played: unknown) => {
      if (typeof played !== "object" || played === null) {
        return undefined;
      }
      const p = played as Record<string, unknown>;
      const by = playerId(p.by);
      const card = cardOrNull(p.card);
      return by === null || card === undefined ? undefined : { by, card };
    });
    return cards.some((card: unknown) => card === undefined)
      ? undefined
      : { cards, leader, winner };
  });
  return tricks.some((trick) => trick === undefined) ? undefined : tricks;
}

const BOLDNESS = new Set(["bold", "cautious", "normal"]);
const STRENGTHS = new Set(["normal", "strong", "weak"]);

/**
 * Reads a reported robot-game deal, or nothing.
 *
 * Same trust model as `robotRubberFrom` — there is no server in a robot game
 * to have witnessed it, so this is bounded and typed rather than verified.
 * `initialHands` is checked at exactly thirteen cards each: unlike the
 * generous bounds elsewhere, that is not a policy choice, it is what a dealt
 * hand is.
 */
/**
 * A draw-turn record, or nothing. Twenty-six of them, one per turn of the draw.
 *
 * Public information — which of the two cards each seat took, never which cards
 * they were — so there is nothing here a client could not already see.
 */
function drawTurnsOrNull(input: unknown): unknown {
  if (!Array.isArray(input) || input.length > 26) {
    return undefined;
  }
  const valid = input.every(
    (turn) =>
      typeof turn === "object" &&
      turn !== null &&
      playerId((turn as Record<string, unknown>).by) !== null &&
      ((turn as Record<string, unknown>).choice === "kept-first" ||
        (turn as Record<string, unknown>).choice === "took-second"),
  );
  return valid ? input : undefined;
}

function booleanPair(input: unknown): Pair<boolean> | null {
  if (!Array.isArray(input) || input.length !== 2) {
    return null;
  }
  return typeof input[0] === "boolean" && typeof input[1] === "boolean"
    ? [input[0], input[1]]
    : null;
}

/**
 * The standing a deal was bid at, bounded rather than verified.
 *
 * `vulnerable` is checked because it is two booleans and there is no reason not
 * to. The rubber behind it is a nested engine structure and is stored as it
 * arrives — the same trust model as everything else here, since a robot game has
 * no server to have witnessed it and nothing downstream of this is authoritative
 * about anybody's score.
 */
function standingOrNull(input: unknown): NonNullable<HandLog["standing"]> | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = input as Record<string, unknown>;
  const vulnerable = booleanPair(value.vulnerable);
  if (vulnerable === null) {
    return undefined;
  }
  // A duplicate deal has vulnerability and no rubber, which is not a partial
  // standing but the whole of the one it was bid at. Kept out of the object
  // altogether rather than sent as null, so a reader asking "was there a rubber"
  // gets the same answer as one asking "was this a session".
  const rubber =
    typeof value.rubber === "object" && value.rubber !== null
      ? (value.rubber as NonNullable<NonNullable<HandLog["standing"]>["rubber"]>)
      : undefined;
  return { ...(rubber === undefined ? {} : { rubber }), vulnerable };
}

/**
 * The house rules a deal was played under, or undefined — which is every current
 * client, since the open discard was withdrawn and there are no house rules left.
 *
 * Still parsed rather than dropped: the service worker keeps old builds in
 * circulation, and a deal somebody played under the variant is worth recording as
 * having been played under it.
 */
function rulesOrNull(input: unknown): NonNullable<HandLog["rules"]> | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = input as Record<string, unknown>;
  return typeof value.openDiscard === "boolean" ? { openDiscard: value.openDiscard } : undefined;
}

function handLogFrom(body: unknown): { dealJson: string; log: HandLog } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const value = body as Record<string, unknown>;

  const auction = auctionOrNull(value.auction);
  const completedTricks = completedTricksOrNull(value.completedTricks);
  const contract = contractOrNull(value.contract);
  const hand0 = handOrNull(value.initialHands0);
  const hand1 = handOrNull(value.initialHands1);
  const tricksWon = countPair(value.tricksWon);

  // Everything below is optional, for the same reason `botVersion` is tolerated
  // missing: the service worker keeps older builds in circulation, and a deal
  // somebody played is worth recording whether or not their client knew to send
  // the seed it was dealt from. A log without them is simply one the draw phase
  // cannot be replayed from.
  const drawTurns = drawTurnsOrNull(value.drawTurns);
  const rules = rulesOrNull(value.rules);
  const standing = standingOrNull(value.standing);
  const starter = playerId(value.starter);
  const seed =
    typeof value.seed === "number" && Number.isInteger(value.seed) && value.seed >= 0
      ? value.seed
      : null;

  if (
    auction === undefined ||
    completedTricks === undefined ||
    contract === undefined ||
    hand0 === undefined ||
    hand1 === undefined ||
    tricksWon === null ||
    typeof value.deviceToken !== "string" ||
    value.deviceToken === "" ||
    typeof value.botVersion !== "number" ||
    !Number.isInteger(value.botVersion) ||
    value.botVersion < 0 ||
    value.botVersion > 1000 ||
    typeof value.boldness !== "string" ||
    !BOLDNESS.has(value.boldness) ||
    // `strength` is *not* required, and requiring it was a real outage. The
    // difficulty rung took ownership of the sample count and the client stopped
    // sending the old dial — at which point this rejected every hand log with a
    // 400, and `outbox.ts` treats a 4xx as permanent, so they were dropped rather
    // than retried. A validator for a field the sender has stopped having is the
    // same failure as a validator for one it never had: the server must accept
    // what an older *or newer* client sends, since the service worker guarantees
    // both are in circulation.
    typeof value.disguise !== "boolean"
  ) {
    return null;
  }

  const log: HandLog = {
    auction: auction as HandLog["auction"],
    boldness: value.boldness,
    botVersion: value.botVersion,
    completedTricks: completedTricks as HandLog["completedTricks"],
    contract,
    deviceToken: value.deviceToken,
    disguise: value.disguise,
    initialHands: [hand0, hand1] as HandLog["initialHands"],
    tricksWon,
    // Narrowed the same way a rung is on a result: stored as sent rather than
    // checked against a list, so a client deployed ahead of the server keeps a
    // usable log instead of one that reads as "before difficulty existed".
    ...(rung(value.difficulty) === null ? {} : { difficulty: rung(value.difficulty)! }),
    ...(typeof value.strength === "string" && STRENGTHS.has(value.strength)
      ? { strength: value.strength }
      : {}),
    ...(drawTurns === undefined
      ? {}
      : { drawTurns: drawTurns as NonNullable<HandLog["drawTurns"]> }),
    // Absent means a rubber, which is all there was before there were formats. It is
    // load-bearing rather than a label: `objectiveFor` reads it to decide what the
    // bidder was pricing in, and a session's call replayed as a rubber's is a
    // different decision with the same auction in front of it.
    ...(value.format === "duplicate" || value.format === "game" || value.format === "mirror"
      ? { format: value.format }
      : {}),
    ...(rules === undefined ? {} : { rules }),
    ...(seed === null ? {} : { seed }),
    ...(standing === undefined ? {} : { standing }),
    ...(starter === null ? {} : { starter }),
  };

  return {
    dealJson: JSON.stringify({
      auction: log.auction,
      completedTricks: log.completedTricks,
      contract: log.contract,
      initialHands: log.initialHands,
      tricksWon: log.tricksWon,
      ...(log.drawTurns === undefined ? {} : { drawTurns: log.drawTurns }),
      ...(log.format === undefined ? {} : { format: log.format }),
      ...(log.rules === undefined ? {} : { rules: log.rules }),
      ...(log.seed === undefined ? {} : { seed: log.seed }),
      ...(log.standing === undefined ? {} : { standing: log.standing }),
      ...(log.starter === undefined ? {} : { starter: log.starter }),
    }),
    log,
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

    // Whether this account's name appears to anyone else on the leaderboard.
    // Their own row is unaffected either way — see `buildStandings`.
    if (url.pathname === "/api/auth/hide-from-leaderboard" && request.method === "POST") {
      const accountId = await accountFromRequest(request, env, Date.now());
      if (accountId === null) {
        return json(request, { error: "Not signed in" }, 401);
      }
      const body = (await request.json().catch(() => ({}))) as { hidden?: unknown };
      if (typeof body.hidden !== "boolean") {
        return json(request, { error: "That is not a valid setting" }, 400);
      }
      await setHideFromLeaderboard(env, accountId, body.hidden);
      return json(request, { hidden: body.hidden });
    }

    // What each computer opponent is rated, on each difficulty rung.
    //
    // **Deliberately open, where everything around it needs a session.** These are
    // constants about the bot, not about anybody: the same dozen numbers for every
    // player, revealing nothing about who plays or how they do. Behind a session
    // they would be, and were, unreachable exactly when they are wanted — the play
    // screen shows the opponent's rating beside its seat, the robot game must work
    // with no account at all, and a fresh install would otherwise show a blank
    // until somebody happened to open the record screen.
    //
    // Sent from here rather than kept in the client so the number on the
    // difficulty row, the number beside the computer's seat and the number the
    // rating walk actually used are one number. This ladder will be retuned, and
    // three copies of an anchor is three things to forget.
    if (url.pathname === "/api/bots" && request.method === "GET") {
      return json(request, { anchors: botAnchors(), mirrorAnchors: botAnchors("mirror") });
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

    // Where everybody stands, which is the one read here that is not about the
    // asker — see `standings.ts`. Behind a session because it shows one player
    // another player's number, and its own route rather than a field on the
    // record because nobody checking their own w-l should pay for the pool's
    // rows.
    if (url.pathname === "/api/standings" && request.method === "GET") {
      const accountId = await accountFromRequest(request, env, Date.now());
      if (accountId === null) {
        return json(request, { error: "Not signed in" }, 401);
      }
      return json(request, await standingsFor(env, accountId));
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
      // Achievements are opt-in rather than implied: a fresh record and a wiped
      // collection are two different wishes — see `resetRecord`. Absent means
      // no, which is the safe reading of a body this route did not used to take
      // at all, and so is also what an older client sending none gets.
      const body = (await request.json().catch(() => ({}))) as { achievements?: unknown };
      const achievements = body.achievements === true;
      return json(request, { forgotten: await resetRecord(env, accountId, { achievements }) });
    }

    // Deleting the account itself (Guideline 5.1.1(v)), rather than just its
    // record — see `deleteAccount` for why detaching, not deleting, is what
    // keeps everyone else's history and rating chain intact.
    if (url.pathname === "/api/account/delete" && request.method === "POST") {
      const accountId = await accountFromRequest(request, env, Date.now());
      if (accountId === null) {
        return json(request, { error: "Not signed in" }, 401);
      }
      await deleteAccount(env, accountId);
      return json(request, { deleted: true });
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
          difficulty: rubber.difficulty,
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
          // A drawn session is a real result and has to be recordable, or a match
          // somebody played goes missing — the same failure `outbox.ts` exists to
          // prevent. Duplicate made it common rather than theoretical: a board is
          // flat whenever both of its runs score the same, so a short session is
          // level a fair fraction of the time.
          // Recorded, and kept out of the rating walk rather than refused: a match
          // somebody played is worth writing down whether or not it can be rated.
          repeated: rubber.repeated,
          winner: rubber.drawn ? DRAWN : rubber.won ? 0 : 1,
        },
        playedAt(rubber.finishedAt, Date.now()),
      );
      return json(request, { ok: true }, 201);
    }

    // A completed robot-game deal — both hands, the auction, every trick —
    // logged for later assessment against the double-dummy solver, the same
    // way `bench/par.ts` already assesses synthetic ones. Same trust model as
    // `/api/results/robot`: no server was in the loop to have watched this
    // deal, and an account is never required to log one.
    if (url.pathname === "/api/hands/log" && request.method === "POST") {
      const parsed = handLogFrom(await request.json().catch(() => null));
      if (parsed === null) {
        return json(request, { error: "Not a hand log" }, 400);
      }

      const accountId = await accountFromRequest(request, env, Date.now());
      await recordHandLog(env, parsed.log, accountId, parsed.dealJson, Date.now());
      return json(request, { ok: true }, 201);
    }

    // The logged deals themselves, for looking at what a later assessment
    // pass will actually see. Every hand anyone has played against the
    // computer, not just the asker's own, so this is not the same kind of
    // thing `/api/results` is — gated to the playtesters list rather than to
    // an ordinary session, and a 404 rather than a 401 for anyone else, same
    // reasoning as `/api/auth/dev`: a route that says "not authorized" has
    // admitted it exists.
    // Every recently finished match, by anybody. The same kind of route as
    // `/api/hands` and gated the same way — not scoped to the asker, so a
    // session is not the right permission and a 404 rather than a 401 keeps it
    // from admitting it exists.
    if (url.pathname === "/api/results/all" && request.method === "GET") {
      const accountId = await accountFromRequest(request, env, Date.now());
      const account = accountId === null ? null : await accountFor(env, accountId);
      if (account === null || !isPlaytester(env, account.email)) {
        return json(request, { error: "Not found" }, 404);
      }
      const asked = Number(url.searchParams.get("limit"));
      const limit = Number.isInteger(asked) && asked > 0 && asked <= 200 ? asked : 50;
      return json(request, { matches: await everyRecentMatch(env, limit) });
    }

    if (url.pathname === "/api/hands" && request.method === "GET") {
      const accountId = await accountFromRequest(request, env, Date.now());
      const account = accountId === null ? null : await accountFor(env, accountId);
      if (account === null || !isPlaytester(env, account.email)) {
        return json(request, { error: "Not found" }, 404);
      }
      const requested = Number(url.searchParams.get("limit"));
      const limit = Number.isInteger(requested) && requested > 0 && requested <= 200 ? requested : 50;
      return json(request, { hands: await handLogsFor(env, limit) });
    }

    // The badge list and running counters behind it, for the Achievements
    // screen. Behind a session for the same reason as `/api/results`.
    if (url.pathname === "/api/achievements" && request.method === "GET") {
      const accountId = await accountFromRequest(request, env, Date.now());
      if (accountId === null) {
        return json(request, { error: "Not signed in" }, 401);
      }
      return json(request, await achievementsFor(env, accountId));
    }

    // A robot deal's achievement facts, reported the instant it completes so
    // an abandoned rubber still banks the hands played inside it. Self-reported
    // and taken on trust for the same reason `/api/results/robot` is — there is
    // no server in a robot game to have witnessed it.
    if (url.pathname === "/api/achievements/deal" && request.method === "POST") {
      const accountId = await accountFromRequest(request, env, Date.now());
      if (accountId === null) {
        return json(request, { error: "Not signed in" }, 401);
      }
      const parsed = dealFactsFrom(await request.json().catch(() => null));
      if (parsed === null) {
        return json(request, { error: "Not a deal report" }, 400);
      }
      const unlocked = await applyDealAchievements(
        env,
        accountId,
        parsed.facts,
        parsed.player,
        Date.now(),
      );
      return json(request, { unlocked }, 201);
    }

    // A robot rubber's achievement facts — Take the Rubber, Down But Not Out,
    // Marathon — reported once it completes, same trust model as the deal route.
    if (url.pathname === "/api/achievements/rubber" && request.method === "POST") {
      const accountId = await accountFromRequest(request, env, Date.now());
      if (accountId === null) {
        return json(request, { error: "Not signed in" }, 401);
      }
      const parsed = rubberFactsFrom(await request.json().catch(() => null));
      if (parsed === null) {
        return json(request, { error: "Not a rubber report" }, 400);
      }
      const unlocked = await applyRubberAchievements(
        env,
        accountId,
        parsed.facts,
        parsed.player,
        Date.now(),
      );
      return json(request, { unlocked }, 201);
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
