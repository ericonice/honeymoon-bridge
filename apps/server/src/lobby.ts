import { DurableObject } from "cloudflare:workers";
import type { LobbyClientMessage, LobbyServerMessage } from "@hb/protocol";
import { inviteCode } from "./codes.js";
import type { Env } from "./env.js";

/** Kept on the socket so a hibernated lobby still knows who is queued. */
interface Waiting {
  readonly nickname: string;
  readonly token: string;
}

/**
 * The queue, as a single Durable Object.
 *
 * One instance for the whole game, which is what makes it a queue at all —
 * matchmaking is the one part of this system that cannot be sharded by table,
 * because the entire point is putting strangers to each other in touch.
 *
 * It holds no state of its own: who is waiting is whoever currently has a
 * socket open here, read back off the sockets themselves. That means leaving
 * the queue needs no message and no timeout — closing the tab closes the
 * socket, and a place in the queue cannot outlive the person holding it.
 */
export class Lobby extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let message: LobbyClientMessage;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (message.type !== "queue") {
      return;
    }

    ws.serializeAttachment({ nickname: message.nickname, token: message.token } satisfies Waiting);
    await this.#pair();
  }

  override async webSocketClose(): Promise<void> {
    // Somebody left; tell whoever is still here what the queue looks like now.
    this.#announce();
  }

  override async webSocketError(): Promise<void> {
    this.#announce();
  }

  #queued(): { readonly seat: Waiting; readonly ws: WebSocket }[] {
    return this.ctx
      .getWebSockets()
      .flatMap((ws) => {
        const seat = ws.deserializeAttachment() as Waiting | null;
        return seat === null ? [] : [{ seat, ws }];
      });
  }

  async #pair(): Promise<void> {
    const queued = this.#queued();

    // Never match somebody with themselves. Two tabs on one device is how this
    // gets tested, so it is the first thing that would go wrong.
    const first = queued[0];
    const second = queued.find((entry) => entry.seat.token !== first?.seat.token);

    if (first === undefined || second === undefined) {
      this.#announce();
      return;
    }

    const code = inviteCode();
    for (const entry of [first, second]) {
      // Cleared before sending, so a socket that lingers is not still queued.
      entry.ws.serializeAttachment(null);
      this.#send(entry.ws, { type: "matched", code });
    }
    this.#announce();
  }

  #announce(): void {
    const queued = this.#queued();
    for (const entry of queued) {
      this.#send(entry.ws, { type: "waiting", waiting: queued.length - 1 });
    }
  }

  #send(ws: WebSocket, message: LobbyServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // A socket that has gone away is not an error worth propagating.
    }
  }
}
