import { opponentOf } from "@hb/engine";
import type { DealAction, PlayerId, Unlock } from "@hb/engine";
import type { ClientMessage, ServerMessage, SessionSnapshot, TableInfo } from "@hb/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { storedSession } from "./account.js";
import { playerToken, preferredFormat } from "./identity.js";
import type { GameSession } from "./session.js";
import { tableSocketUrl } from "./serverUrl.js";

/** How often to prove the socket is still there. Well inside any idle timeout. */
const HEARTBEAT_MS = 25_000;

/** Backoff between reconnection attempts, in milliseconds. */
const RETRY_MS = [500, 1000, 2000, 4000, 8000];

export type Connection = "connecting" | "open" | "closed";

export interface NetworkGame {
  readonly connection: Connection;
  /** The last thing the server refused or complained about. */
  readonly error: string | null;
  /** Null until both seats are filled and the first deal is dealt. */
  readonly session: GameSession | null;
  readonly seat: PlayerId | null;
  readonly table: TableInfo | null;
  /** Drops the socket on purpose, to exercise the reconnect path (§3.6). */
  dropSocket(): void;
  /** Gives up the seat, so the other player is told rather than left waiting. */
  leave(): void;
}

function sessionFrom(
  snapshot: SessionSnapshot,
  table: TableInfo,
  seat: PlayerId,
  send: (message: ClientMessage) => void,
  justUnlocked: readonly Unlock[],
  clearUnlocks: () => void,
): GameSession {
  const them = table.seats[opponentOf(seat)];

  return {
    act: (action: DealAction) => {
      send({ type: "action", action });
    },
    clearUnlocks,
    history: snapshot.history,
    justTaken: snapshot.justTaken,
    justUnlocked,
    lastDraw: snapshot.lastDraw,
    lastTrick: snapshot.lastTrick,
    nextDeal: () => {
      send({ type: "next-deal" });
    },
    // The server never sends these, in any build. There is nothing to gate.
    opponentHand: null,
    opponentLastDraw: null,
    opponentName: them?.nickname ?? "Opponent",
    opponentPending: null,
    opponentWaitingToContinue: !table.ready[seat] && table.ready[opponentOf(seat)],
    rubber: snapshot.rubber,
    score: snapshot.score,
    // Not on offer: the server decides what a seat may do and would refuse it.
    skipPhase: null,
    view: snapshot.view,
    vulnerable: snapshot.vulnerable,
    waitingOnOpponent: snapshot.view.toAct !== snapshot.view.me,
    waitingToContinue: table.ready[seat] && !table.ready[opponentOf(seat)],
  };
}

/**
 * A table played over a socket.
 *
 * The same `GameSession` the screens already consume, sourced from a Durable
 * Object instead of from a reducer in this tab. Nothing below this knows the
 * difference, which is the point of the interface.
 *
 * Reconnection is treated as ordinary rather than exceptional, because on iOS
 * it is: the socket drops every time the phone locks or a call arrives (§2.2).
 * So this reconnects on a backoff, on the network coming back, and on the tab
 * becoming visible — and because the server replies with a whole snapshot
 * rather than a diff, coming back is just being told the state again. There is
 * no replay to catch up on and no way to be quietly out of step.
 */
export function useNetworkSession(code: string): NetworkGame {
  const [connection, setConnection] = useState<Connection>("connecting");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [table, setTable] = useState<TableInfo | null>(null);
  const [seat, setSeat] = useState<PlayerId | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Already decided by the server — see `Table#applyAchievements` — so this
  // only ever accumulates and clears what arrives, unlike the robot game's
  // own local evaluation.
  const [justUnlocked, setJustUnlocked] = useState<readonly Unlock[]>([]);

  const socket = useRef<WebSocket | null>(null);
  const attempt = useRef(0);
  const retry = useRef<number | null>(null);
  const closed = useRef(false);

  const send = useCallback((message: ClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    closed.current = false;

    const connect = (): void => {
      if (closed.current) {
        return;
      }
      setConnection("connecting");
      const ws = new WebSocket(tableSocketUrl(code));
      socket.current = ws;

      ws.addEventListener("open", () => {
        attempt.current = 0;
        setConnection("open");
        // The token is what makes this a reconnection rather than a new player.
        // The session is read fresh on every join rather than captured once, so
        // signing in or out takes effect on the next reconnect without a reload.
        //
        // No name goes with it: the server reads that off the account the
        // session proves, so there is nothing here for a seat to claim.
        ws.send(
          JSON.stringify({
            type: "join",
            format: preferredFormat(),
            session: storedSession(),
            token: playerToken(),
          } satisfies ClientMessage),
        );
      });

      ws.addEventListener("message", (event: MessageEvent<string>) => {
        const message = JSON.parse(event.data) as ServerMessage;
        if (message.type === "error") {
          setError(message.message);
          return;
        }
        if (message.type === "achievements") {
          setJustUnlocked((current) => [...current, ...message.unlocked]);
          return;
        }
        setError(null);
        setSeat(message.seat);
        setSnapshot(message.snapshot);
        setTable(message.table);
      });

      ws.addEventListener("close", () => {
        setConnection("closed");
        if (closed.current) {
          return;
        }
        const wait = RETRY_MS[Math.min(attempt.current, RETRY_MS.length - 1)]!;
        attempt.current += 1;
        retry.current = window.setTimeout(connect, wait);
      });
    };

    connect();

    const beat = window.setInterval(() => {
      send({ type: "heartbeat" });
    }, HEARTBEAT_MS);

    // iOS suspends a backgrounded tab and drops the socket with it, so coming
    // back to the app is the moment to check rather than a moment to trust.
    const wake = (): void => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (socket.current === null || socket.current.readyState > WebSocket.OPEN) {
        attempt.current = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);

    return () => {
      closed.current = true;
      window.clearInterval(beat);
      if (retry.current !== null) {
        window.clearTimeout(retry.current);
      }
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      socket.current?.close();
      socket.current = null;
    };
  }, [code, send]);

  const dropSocket = useCallback(() => {
    // Closed as though the network did it, so the retry path runs for real.
    socket.current?.close();
  }, []);

  const leave = useCallback(() => {
    // Told, not just disconnected — otherwise the other player is shown a
    // countdown for somebody who has gone. Reconnection is suppressed first so
    // the retry loop does not immediately reclaim the seat just given up.
    closed.current = true;
    send({ type: "leave" });
    socket.current?.close();
  }, [send]);

  // Stable across renders on purpose: `AchievementToast` restarts its dismiss
  // timer whenever this identity changes, and an inline closure recreated on
  // every incoming state message would never actually let it expire.
  const clearUnlocks = useCallback(() => {
    setJustUnlocked([]);
  }, []);

  return {
    connection,
    dropSocket,
    leave,
    error,
    seat,
    session:
      snapshot === null || table === null || seat === null
        ? null
        : sessionFrom(snapshot, table, seat, send, justUnlocked, clearUnlocks),
    table,
  };
}
