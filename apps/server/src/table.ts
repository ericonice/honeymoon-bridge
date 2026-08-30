import { DurableObject } from "cloudflare:workers";
import {
  actOn,
  dealFacts,
  dealOf,
  nextIn,
  restoreTable,
  rubberFacts,
  startMatch,
  summarizeMatch,
} from "@hb/engine";
import type {
  DuplicateSchedule,
  MatchFormat,
  MatchState,
  MatchSummary,
  Pair,
  PlayerId,
  RubberFormat,
  TableState,
  Unlock,
} from "@hb/engine";
import { PROTOCOL_VERSION, snapshotFor } from "@hb/protocol";
import type { ClientMessage, Seating, ServerMessage, TableInfo } from "@hb/protocol";
import { applyDealAchievements, applyRubberAchievements } from "./achievements.js";
import { accountFor, verifySession } from "./auth.js";
import { dealSeed } from "./codes.js";
import type { Env } from "./env.js";
import { formatFor } from "./matchFormat.js";
import { DRAWN, recordRubber } from "./results.js";
import type { SeatedAccount } from "./seating.js";
import { refuseSeat } from "./seating.js";

/** §2.2: a player who vanishes has three minutes to come back before the table is written off. */
const GRACE_MS = 3 * 60 * 1000;

/** `WebSocket.OPEN`, spelled out because the value is what matters here. */
const OPEN = 1;

interface SeatRecord {
  /**
   * The signed-in account holding this seat.
   *
   * Set only from a session whose signature verified here. It is what a result
   * will be attributed to, so it must never be taken on a client's word: a seat
   * that merely *claimed* an account would make the record it produced
   * worthless.
   *
   * Null only for a seat taken before §3.7 required an account, which a token
   * can still reclaim — the gate is on sitting down, not on staying seated.
   */
  readonly accountId: string | null;
  /** What this player asked for. Only consulted when the match starts. */
  /** What this player asked for. Only consulted when the match starts. */
  readonly format: MatchFormat;
  /** How long a session they asked for, in deals. Only consulted for duplicate. */
  readonly deals: number;
  /** What each half of a two-game match runs to. Only consulted when both asked. */
  readonly halfFormat: RubberFormat;
  /** How they want a session ordered. Only consulted when both asked for the same. */
  readonly order: DuplicateSchedule;
  readonly nickname: string;
  /** The opaque value in the client's `localStorage`. This is what holds a seat. */
  readonly token: string;
}

interface Stored {
  readonly code: string;
  /**
   * Whether the deal on the table has already had its achievements applied.
   *
   * A deal completing is one action; nothing stops a client resending it, and
   * unlike a one-shot unlock (deduped by its own primary key) the running
   * counters behind Hands Played/Won/Lost have no such protection on their
   * own. Reset alongside `ready` whenever a fresh deal is dealt.
   */
  readonly dealAchievementsApplied: boolean;
  /** Who has asked to move on from the finished deal. Cleared when it is dealt. */
  readonly ready: [boolean, boolean];
  /**
   * Whether the rubber in progress has already been written to `results`.
   *
   * A rubber is won part-way through an action, and actions keep arriving after
   * it — so without this the same rubber would be recorded once per remaining
   * message. Cleared when a fresh rubber starts.
   */
  readonly recorded: boolean;
  readonly seats: [SeatRecord | null, SeatRecord | null];
  /** Null until both seats are filled and the first deal is dealt. */
  /**
   * The match on the table, or null before both seats are filled.
   *
   * Persisted under the key `table` and read through `matchFrom`, which is what
   * keeps a sitting already under way alive across the deploy that introduced this:
   * the stored value used to be a bare `TableState`. Applied on read rather than as
   * a migration, the same way `withImpliedTiers` repairs a stored achievement — the
   * old shape stays in storage and the answer comes out right anyway.
   */
  readonly match: MatchState | null;
}

/** Kept on the socket so a hibernated object still knows who is on the other end. */
interface Attachment {
  readonly seat: PlayerId;
  readonly token: string;
}

const SEATS: readonly PlayerId[] = [0, 1];

/**
 * One table, addressed by its invite code.
 *
 * The authority for a networked game: it owns the `TableState`, deals the
 * seeds, and is the only thing that ever sees both hands. Clients send
 * intentions and receive `snapshotFor` projections — never state — so a client
 * that lies, or is simply patched, cannot make an illegal move or learn a card.
 *
 * Sockets are accepted through the Hibernation API rather than held open. A
 * table spends nearly all of its life waiting for somebody to think, and an
 * object that stays resident to hold an idle socket bills wall-clock time for
 * doing nothing (§3.3). Between messages this object may cease to exist
 * entirely; everything it needs is either in storage or attached to the socket.
 */
/**
 * What is actually in storage, which is not quite `Stored`.
 *
 * A sitting under way when this deploys has a bare `TableState` under `table`,
 * because that is what the object held before a match could be a session. Read
 * through rather than migrated: the old shape stays where it is and comes out right
 * anyway, which is the same reasoning `ratings.ts` gives for recomputing and
 * `withImpliedTiers` for repairing on read. A rubber somebody is in the middle of is
 * not worth a migration to lose.
 */
type StoredOnDisk = Omit<Stored, "match"> & {
  readonly match?: MatchState | null;
  /** The pre-duplicate shape: a bare table, before a match could be a session. */
  readonly table?: TableState | null;
};

/**
 * The match two filled seats have agreed to play, or null while one is empty.
 *
 * Every seed is minted here and never leaves the object. For a rubber that is one
 * deal's stock order; for a session it is also every board nobody has played yet,
 * which is why `snapshotFor` sends the standing's summary and never its state.
 */
function startingMatch(seats: readonly [SeatRecord | null, SeatRecord | null]): MatchState | null {
  const [first, second] = seats;
  if (first === null || second === null) {
    return null;
  }
  const agreed = formatFor(first, second);
  return startMatch({
    ...(agreed.format === "duplicate"
      ? { boards: agreed.boards, schedule: agreed.order }
      : {}),
    firstBoard: dealSeed(),
    format: agreed.format,
    halfFormat: agreed.halfFormat,
    seed: dealSeed(),
    starter: 0,
  });
}

/**
 * The stored match, with anything it predates filled in.
 *
 * Two shapes have to survive here, and the second one bit. A sitting from before
 * `MatchState` existed is a bare `TableState` under `table`. A sitting from before the
 * return match is a `MatchState` whose rubber has no `dealt` or `replay` — and
 * `nextDeal` indexes `replay` by `dealt.length`, so without this every action of a
 * rubber already under way at a table throws.
 */
function matchFrom(stored: StoredOnDisk): MatchState | null {
  const match = stored.match;
  if (match !== undefined) {
    if (match === null || match.kind !== "rubber") {
      return match ?? null;
    }
    return { kind: "rubber", table: restoreTable(match.table) };
  }
  return stored.table == null ? null : { kind: "rubber", table: restoreTable(stored.table) };
}

export class Table extends DurableObject<Env> {
  #cached: Stored | null = null;

  async #load(): Promise<Stored> {
    if (this.#cached !== null) {
      return this.#cached;
    }
    const stored = await this.ctx.storage.get<StoredOnDisk>("table");
    this.#cached =
      stored === undefined
        ? {
            code: "",
            dealAchievementsApplied: false,
            ready: [false, false],
            recorded: false,
            seats: [null, null],
            match: null,
          }
        : { ...stored, match: matchFrom(stored) };
    return this.#cached;
  }

  async #save(stored: Stored): Promise<void> {
    this.#cached = stored;
    // Written under the same key and without the legacy `table`, so the old shape
    // disappears the first time anything happens at this table.
    // Persisted so an in-flight rubber survives a deploy or an eviction, which
    // matters when a rubber runs the better part of an hour (§3.3).
    await this.ctx.storage.put("table", stored);
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const code = new URL(request.url).searchParams.get("code") ?? "";
    const stored = await this.#load();
    if (stored.code === "") {
      await this.#save({ ...stored, code });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // Hibernation: the runtime holds this socket, not this object.
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let message: ClientMessage;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      this.#send(ws, { type: "error", message: "Unreadable message" });
      return;
    }

    switch (message.type) {
      case "join": {
        await this.#join(ws, message);
        return;
      }
      case "action": {
        await this.#act(ws, message);
        return;
      }
      case "next-deal": {
        await this.#nextDeal(ws);
        return;
      }
      case "leave": {
        await this.#leave(ws);
        return;
      }
      case "heartbeat": {
        return;
      }
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const seat = this.#seatOf(ws);
    if (seat === null) {
      return;
    }
    // The other player is owed a countdown rather than a frozen table.
    if (this.#connectedSeats(ws).some((other) => other !== seat)) {
      await this.ctx.storage.setAlarm(Date.now() + GRACE_MS);
    }
    await this.#broadcast(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /**
   * The grace period ran out. §2.2: an abandoned rubber ends unscored and the
   * table is discarded — there are no standings to protect, so there is nothing
   * to be gained by keeping it.
   */
  override async alarm(): Promise<void> {
    if (this.#connectedSeats().length === 2) {
      return;
    }
    for (const ws of this.ctx.getWebSockets()) {
      this.#send(ws, { type: "error", message: "Table abandoned" });
      ws.close(1000, "Table abandoned");
    }
    await this.ctx.storage.deleteAll();
    this.#cached = null;
  }

  async #join(ws: WebSocket, message: Extract<ClientMessage, { type: "join" }>): Promise<void> {
    // Accepts this version and the one before it — a client older than that
    // predates changes this table may already be relying on. A client too old
    // to send `protocol` at all reads as older than any real version, however
    // low `PROTOCOL_VERSION` starts — -1 rather than 0, since 0 would collide
    // with "the version before 1" the very first time this ships and let
    // exactly the client this exists to catch straight through.
    const protocol = typeof message.protocol === "number" ? message.protocol : -1;
    if (protocol < PROTOCOL_VERSION - 1) {
      this.#send(ws, { type: "outdated" });
      ws.close(1008, "Outdated client");
      return;
    }

    const { token } = message;
    const stored = await this.#load();
    const seats: [SeatRecord | null, SeatRecord | null] = [stored.seats[0], stored.seats[1]];

    // A token reclaims the seat it already holds; that is what makes a dropped
    // socket a reconnection rather than a new player. Deliberately still the
    // token and not the account — §4 keeps a rubber on the device that started
    // it, so signing in on a second phone does not walk off with a seat.
    const held = SEATS.find((index) => seats[index]?.token === token) ?? null;
    const account = await this.#accountFrom(message.session);

    // The gate is on sitting down, not on staying seated (§3.7). Somebody
    // already at this table comes back whatever their session says, because a
    // rotated secret or an expired session would otherwise take a rubber away
    // from somebody in the middle of it. Somebody arriving needs an account.
    if (held === null) {
      const refusal = refuseSeat(account);
      if (refusal !== null) {
        this.#send(ws, { type: "error", message: refusal });
        ws.close(1008, refusal);
        return;
      }
    }

    const seat = held ?? SEATS.find((index) => seats[index] === null) ?? null;
    if (seat === null) {
      this.#send(ws, { type: "error", message: "This table already has two players" });
      ws.close(1008, "Table full");
      return;
    }

    const previous = seats[seat];
    seats[seat] = {
      // A session that no longer verifies leaves the seat's attribution alone
      // rather than erasing it: the account was proved when the seat was taken.
      accountId: account?.id ?? previous?.accountId ?? null,
      // Absent from a client too old to ask for a session, which is what a rubber
      // preference reads as anyway — the length is only consulted when both seats
      // asked for duplicate.
      deals: message.sessionDeals ?? 0,
      format: message.format,
      // A client too old to ask reads as the default, which is what the format is
      // for — a pair of single games, about six deals.
      halfFormat: message.halfFormat ?? "game",
      // A client too old to have an opinion reads as the default, which is what it
      // would have been playing.
      order: message.sessionOrder ?? "halves",
      // The last fallback is unreachable: a seat is either being resumed, and
      // has a name already, or has just passed `refuse`, which requires one.
      nickname: account?.name ?? previous?.nickname ?? "",
      token,
    };
    ws.serializeAttachment({ seat, token } satisfies Attachment);

    // Both seats filled and nothing dealt yet: start the match. Every seed is
    // generated here and never leaves — one reconstructs a whole deal's stock order,
    // and for a session that is true of boards nobody has played yet.
    const match = stored.match ?? startingMatch(seats);

    await this.#save({ ...stored, match, seats });
    await this.ctx.storage.deleteAlarm();
    await this.#broadcast();
  }

  async #act(ws: WebSocket, message: Extract<ClientMessage, { type: "action" }>): Promise<void> {
    const stored = await this.#load();
    const seat = this.#seatOf(ws);
    if (seat === null || stored.match === null) {
      this.#send(ws, { type: "error", message: "Not seated at a started table" });
      return;
    }

    // The engine refuses anything illegal, including acting out of turn. The
    // client's own copy of the rules is a convenience; this is the authority.
    let next: MatchState;
    try {
      next = actOn(stored.match, seat, message.action);
    } catch (error) {
      this.#send(ws, { type: "error", message: (error as Error).message });
      return;
    }

    // Everything from here on is bookkeeping about a move the engine has
    // already accepted, and none of it may cost the move. The one action in a
    // whole deal that touches the database is the one that completes it — the
    // achievements below — so a database that is slow, unreachable or a
    // migration behind stops exactly one card from being playable: the last
    // one, every deal, with the client shown nothing at all because the state
    // it is waiting for is never saved and never broadcast. Same rule as
    // `#recordIfWon`, which has said so all along; this is the other half of it.
    const summary = summarizeMatch(next);
    const recorded = await this.#recordIfDecided(stored, summary);
    let applied = true;
    try {
      await this.#applyAchievements(stored, next, summary);
    } catch (error) {
      applied = false;
      console.error("could not apply achievements", (error as Error).message);
    }
    await this.#save({
      ...stored,
      // Only a run that actually got through counts as done, so a resent
      // action retries rather than silently skipping — the flag is there to
      // stop double-counting, not to record an attempt.
      dealAchievementsApplied: dealOf(next).phase === "complete" && applied,
      match: next,
      recorded,
    });
    await this.#broadcast();
  }

  /**
   * Writes the rubber down if that action just won it.
   *
   * Deliberately cannot fail the move. A rubber is a real thing that happened
   * whether or not the database was reachable, and throwing here would reject an
   * action the engine had already accepted — losing the game to save the record
   * of it.
   */
  async #recordIfDecided(stored: Stored, summary: MatchSummary): Promise<boolean> {
    const [first, second] = stored.seats;
    if (stored.recorded || first === null || second === null) {
      return stored.recorded;
    }

    if (!summary.complete) {
      return false;
    }

    // A drawn match is recorded too, which duplicate makes ordinary: a board is flat
    // whenever both of its runs come to the same score, so a short session is level a
    // fair fraction of the time. `DRAWN` is what says so — see `results.ts`.
    //
    // A rubber and a mirror report each side's real accumulated points, always
    // non-negative. A session has no such pair — its own currency is a single
    // signed margin, one side's exact negative of the other — so sending it
    // straight through as each seat's "points" would write a negative number
    // into a column meant to hold a real score. Rebuilt as a winner-takes-the-
    // margin split, the same non-negative shape a rubber's own points have.
    const points: Pair<number> =
      summary.format === "duplicate"
        ? [Math.max(summary.points[0], 0), Math.max(summary.points[1], 0)]
        : summary.points;
    try {
      await recordRubber(
        this.env,
        {
          code: stored.code,
          deals: summary.dealsPlayed,
          format: summary.format,
          seats: [
            {
              accountId: first.accountId,
              nickname: first.nickname,
              points: points[0],
              token: first.token,
            },
            {
              accountId: second.accountId,
              nickname: second.nickname,
              points: points[1],
              token: second.token,
            },
          ],
          winner: summary.winner ?? DRAWN,
        },
        Date.now(),
      );
      return true;
    } catch (error) {
      console.error("could not record the rubber", (error as Error).message);
      return false;
    }
  }

  /**
   * Applies whichever achievements this action just earned, for both seats.
   *
   * Guarded on `stored`'s pre-action flags rather than on `next`, so a deal or
   * rubber already handled is never double-counted even if the same action
   * were somehow delivered twice — see `dealAchievementsApplied` and, for the
   * rubber branch, the same `recorded` flag `#recordIfWon` already keeps.
   */
  async #applyAchievements(stored: Stored, next: MatchState, summary: MatchSummary): Promise<void> {
    const [first, second] = stored.seats;
    if (first === null || second === null) {
      return;
    }
    const seats: readonly [SeatRecord, SeatRecord] = [first, second];

    if (dealOf(next).phase === "complete" && !stored.dealAchievementsApplied) {
      const facts = dealFacts(dealOf(next), summary.score, summary.vulnerable);
      await this.#pushAchievements(seats, (player) =>
        applyDealAchievements(this.env, seats[player].accountId, facts, player, Date.now()),
      );
    }

    // Rubber achievements are about a rubber. Taking the rubber cannot be earned in
    // a session and must not fire in one, which is why this is gated on the
    // standing's *shape* rather than on the match merely finishing.
    if (
      !stored.recorded &&
      summary.complete &&
      summary.winner !== null &&
      summary.standing.kind === "rubber"
    ) {
      const facts = rubberFacts({
        history: summary.standing.history,
        rubber: summary.standing.rubber,
        score: summary.score,
        vulnerable: summary.vulnerable,
      });
      await this.#pushAchievements(seats, (player) =>
        applyRubberAchievements(this.env, seats[player].accountId, facts, player, Date.now()),
      );
    }
  }

  /**
   * Runs `apply` for both seats and sends whatever it unlocked to that seat's
   * own socket, and only that seat's — an unlock can say something about the
   * hand that earned it, so it is exactly as private as the hand itself.
   */
  async #pushAchievements(
    seats: readonly [SeatRecord, SeatRecord],
    apply: (player: PlayerId) => Promise<readonly Unlock[]>,
  ): Promise<void> {
    for (const player of SEATS) {
      const unlocked = await apply(player);
      if (unlocked.length === 0) {
        continue;
      }
      const ws = this.#socketFor(player);
      if (ws !== null) {
        this.#send(ws, { type: "achievements", unlocked });
      }
    }
  }

  #socketFor(seat: PlayerId): WebSocket | null {
    return this.ctx.getWebSockets().find((ws) => this.#seatOf(ws) === seat) ?? null;
  }

  async #nextDeal(ws: WebSocket): Promise<void> {
    const stored = await this.#load();
    const seat = this.#seatOf(ws);
    if (seat === null || stored.match === null) {
      return;
    }
    if (dealOf(stored.match).phase !== "complete") {
      this.#send(ws, { type: "error", message: "The deal is not finished" });
      return;
    }

    // Both have to be done reading the score. One player tapping through would
    // take the other's chance to see how the deal was scored.
    const ready: [boolean, boolean] = [stored.ready[0], stored.ready[1]];
    ready[seat] = true;

    if (!ready[0] || !ready[1]) {
      await this.#save({ ...stored, ready });
      await this.#broadcast();
      return;
    }

    await this.#save({
      ...stored,
      // A fresh deal has had no achievements applied to it yet, whatever the
      // last one's flag said.
      dealAchievementsApplied: false,
      ready: [false, false],
      // `nextIn` starts a fresh match when the last one was decided, so whatever was
      // recorded belongs to a match that is now over.
      match: nextIn(stored.match, dealSeed()),
      recorded: false,
    });
    await this.#broadcast();
  }

  /**
   * Gives up a seat for good.
   *
   * The seat is emptied rather than marked absent, so the token no longer
   * reclaims it — that is what distinguishes leaving from dropping. Any grace
   * period is canceled too: there is nothing left to wait for.
   */
  async #leave(ws: WebSocket): Promise<void> {
    const stored = await this.#load();
    const seat = this.#seatOf(ws);
    if (seat === null) {
      return;
    }

    const seats: [SeatRecord | null, SeatRecord | null] = [stored.seats[0], stored.seats[1]];
    seats[seat] = null;
    ws.serializeAttachment(null);

    await this.#save({ ...stored, seats });
    await this.ctx.storage.deleteAlarm();
    await this.#broadcast();
    ws.close(1000, "Left the table");
  }

  /**
   * The account a session actually proves, with the name that account goes by.
   *
   * Anything that fails — absent, forged, altered, signed with a secret that has
   * since been rotated — comes back null. For somebody taking a seat that is a
   * refusal; for somebody returning to one it costs them nothing, which is the
   * older rule about a stale session costing attribution rather than a game,
   * kept where it still applies.
   */
  async #accountFrom(session: string | null): Promise<SeatedAccount | null> {
    if (session === null || session === "") {
      return null;
    }
    const accountId = await verifySession(session, this.env, Date.now());
    if (accountId === null) {
      return null;
    }
    const account = await accountFor(this.env, accountId);
    return account === null ? null : { id: accountId, name: account.name };
  }

  #seatOf(ws: WebSocket): PlayerId | null {
    const attached = ws.deserializeAttachment() as Attachment | null;
    return attached?.seat ?? null;
  }

  /**
   * Seats with somebody actually on the end of them.
   *
   * `getWebSockets` still lists a socket while its close handler is running, so
   * without excluding it a player who has just vanished is counted as present —
   * and the other player is never shown the countdown they are owed. Checking
   * `readyState` too covers a socket that is closing without having told us.
   */
  #connectedSeats(exclude: WebSocket | null = null): PlayerId[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== exclude && ws.readyState === OPEN)
      .map((ws) => this.#seatOf(ws))
      .filter((seat): seat is PlayerId => seat !== null);
  }

  #send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // A socket that has gone away is not an error worth propagating; the
      // close handler will deal with the seat.
    }
  }

  async #broadcast(exclude: WebSocket | null = null): Promise<void> {
    const stored = await this.#load();
    const connected = new Set(this.#connectedSeats(exclude));
    const waiting = stored.seats.every((s) => s !== null) && connected.size < 2;
    const alarm = waiting ? await this.ctx.storage.getAlarm() : null;

    const seating = (index: PlayerId): Seating | null => {
      const record = stored.seats[index];
      return record === null
        ? null
        : { connected: connected.has(index), nickname: record.nickname };
    };

    const table: TableInfo = {
      code: stored.code,
      ready: [stored.ready[0], stored.ready[1]],
      seats: [seating(0), seating(1)],
      waitingUntil: alarm,
    };

    for (const ws of this.ctx.getWebSockets()) {
      const seat = this.#seatOf(ws);
      if (seat === null) {
        continue;
      }
      this.#send(ws, {
        type: "state",
        seat,
        // Wrapped as the rubber it is. A Durable Object plays rubbers: the wire
        // carries `RubberFormat` on purpose, so it is never handed a duplicate
        // session — see `tableFormat()` in the client. This is what it holds, not a
        // placeholder for something else.
        snapshot: stored.match === null ? null : snapshotFor(stored.match, seat),
        table,
      });
    }
  }
}
