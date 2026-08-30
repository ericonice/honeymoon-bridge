import type { MatchFormat } from "@hb/engine";
import type { LobbyClientMessage, LobbyServerMessage } from "@hb/protocol";
import { useEffect, useRef, useState } from "react";
import { storedSession } from "./account.js";
import { playerToken } from "./identity.js";
import { queueSocketUrl } from "./serverUrl.js";

const HEARTBEAT_MS = 25_000;

export interface QueueState {
  readonly error: string | null;
  /** Set once paired. The caller takes it from here and joins the table. */
  readonly matched: string | null;
  readonly searching: boolean;
  /** How many others are waiting alongside you. */
  readonly others: number;
}

/**
 * Waits in the queue for as long as this is mounted.
 *
 * Leaving is unmounting: there is no "cancel" message, because the socket
 * closing is what removes the place. That means a closed tab, a crashed
 * browser and a tapped Cancel all leave the queue the same way, and none of
 * them can strand a place nobody is standing in.
 *
 * `format` is read fresh into every connection rather than captured once —
 * changing it while still searching reconnects with the new preference, the
 * same way `useNetworkSession` treats a changed setting as taking effect on
 * the next attempt rather than needing this to be torn down and remounted.
 */
export function useQueue(active: boolean, format: MatchFormat | null): QueueState {
  const [matched, setMatched] = useState<string | null>(null);
  const [others, setOthers] = useState(0);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    setMatched(null);
    setError(null);

    const ws = new WebSocket(queueSocketUrl());
    socket.current = ws;

    ws.addEventListener("open", () => {
      setSearching(true);
      ws.send(
        JSON.stringify({
          type: "queue",
          // Omitted rather than sent as null: absent is what "anything" already
          // means to the server — see `LobbyClientMessage`.
          ...(format === null ? {} : { format }),
          session: storedSession(),
          token: playerToken(),
        } satisfies LobbyClientMessage),
      );
    });

    ws.addEventListener("message", (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as LobbyServerMessage;
      if (message.type === "matched") {
        setMatched(message.code);
        return;
      }
      if (message.type === "waiting") {
        setOthers(message.waiting);
        return;
      }
      setError(message.message);
    });

    ws.addEventListener("close", () => {
      setSearching(false);
    });

    const beat = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "heartbeat" } satisfies LobbyClientMessage));
      }
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(beat);
      ws.close();
      socket.current = null;
    };
  }, [active, format]);

  return { error, matched, others, searching };
}
