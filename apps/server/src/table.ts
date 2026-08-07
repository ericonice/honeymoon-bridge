import { DurableObject } from "cloudflare:workers";
import { applyTableAction, nextDeal, startTable } from "@hb/engine";
import type { PlayerId, TableState } from "@hb/engine";
import { snapshotFor } from "@hb/protocol";
import type { ClientMessage, Seating, ServerMessage, TableInfo } from "@hb/protocol";
import { dealSeed } from "./codes.js";
import type { Env } from "./env.js";

/** §2.2: a player who vanishes has three minutes to come back before the table is written off. */
const GRACE_MS = 3 * 60 * 1000;

/** `WebSocket.OPEN`, spelled out because the value is what matters here. */
const OPEN = 1;

interface SeatRecord {
  readonly nickname: string;
  /** The opaque value in the client's `localStorage`. This is the whole of identity. */
  readonly token: string;
}

interface Stored {
  readonly code: string;
  /** Who has asked to move on from the finished deal. Cleared when it is dealt. */
  readonly ready: [boolean, boolean];
  readonly seats: [SeatRecord | null, SeatRecord | null];
  /** Null until both seats are filled and the first deal is dealt. */
  readonly table: TableState | null;
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
export class Table extends DurableObject<Env> {
  #cached: Stored | null = null;

  async #load(): Promise<Stored> {
    if (this.#cached !== null) {
      return this.#cached;
    }
    const stored = await this.ctx.storage.get<Stored>("table");
    this.#cached = stored ?? { code: "", ready: [false, false], seats: [null, null], table: null };
    return this.#cached;
  }

  async #save(stored: Stored): Promise<void> {
    this.#cached = stored;
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
        await this.#join(ws, message.token, message.nickname);
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

  async #join(ws: WebSocket, token: string, nickname: string): Promise<void> {
    const stored = await this.#load();
    const seats: [SeatRecord | null, SeatRecord | null] = [stored.seats[0], stored.seats[1]];

    // A token reclaims the seat it already holds; that is what makes a dropped
    // socket a reconnection rather than a new player.
    let seat = SEATS.find((index) => seats[index]?.token === token) ?? null;
    if (seat === null) {
      seat = SEATS.find((index) => seats[index] === null) ?? null;
    }
    if (seat === null) {
      this.#send(ws, { type: "error", message: "This table already has two players" });
      ws.close(1008, "Table full");
      return;
    }

    seats[seat] = { nickname, token };
    ws.serializeAttachment({ seat, token } satisfies Attachment);

    // Both seats filled and nothing dealt yet: start the rubber. The seed is
    // generated here and never leaves — it reconstructs the whole stock order.
    const table =
      stored.table ?? (seats[0] !== null && seats[1] !== null
        ? startTable({ seed: dealSeed(), starter: 0 })
        : null);

    await this.#save({ ...stored, seats, table });
    await this.ctx.storage.deleteAlarm();
    await this.#broadcast();
  }

  async #act(ws: WebSocket, message: Extract<ClientMessage, { type: "action" }>): Promise<void> {
    const stored = await this.#load();
    const seat = this.#seatOf(ws);
    if (seat === null || stored.table === null) {
      this.#send(ws, { type: "error", message: "Not seated at a started table" });
      return;
    }

    // The engine refuses anything illegal, including acting out of turn. The
    // client's own copy of the rules is a convenience; this is the authority.
    let next: TableState;
    try {
      next = applyTableAction(stored.table, seat, message.action);
    } catch (error) {
      this.#send(ws, { type: "error", message: (error as Error).message });
      return;
    }

    await this.#save({ ...stored, table: next });
    await this.#broadcast();
  }

  async #nextDeal(ws: WebSocket): Promise<void> {
    const stored = await this.#load();
    const seat = this.#seatOf(ws);
    if (seat === null || stored.table === null) {
      return;
    }
    if (stored.table.deal.phase !== "complete") {
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
      ready: [false, false],
      table: nextDeal(stored.table, dealSeed()),
    });
    await this.#broadcast();
  }

  /**
   * Gives up a seat for good.
   *
   * The seat is emptied rather than marked absent, so the token no longer
   * reclaims it — that is what distinguishes leaving from dropping. Any grace
   * period is cancelled too: there is nothing left to wait for.
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
        snapshot: stored.table === null ? null : snapshotFor(stored.table, seat),
        table,
      });
    }
  }
}
