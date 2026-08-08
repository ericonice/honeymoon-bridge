import type { DealAction, MatchFormat, Pair, PlayerId } from "@hb/engine";
import type { SessionSnapshot } from "./snapshot.js";

/** How a seat is identified across a dropped socket. */
export interface Seating {
  readonly connected: boolean;
  readonly nickname: string;
}

/**
 * The table itself, as distinct from the game on it.
 *
 * Kept apart from `SessionSnapshot` because it changes for different reasons —
 * a player's socket dropping is not a move — and because §2.2 wants an explicit
 * "waiting for X to reconnect" state with a countdown, which the game state has
 * nothing to say about.
 */
export interface TableInfo {
  readonly code: string;
  /**
   * Who has asked to move on from a finished deal.
   *
   * A deal ends on a score worth reading, and one player tapping through would
   * take that away from the other — so the next deal waits for both. Against
   * the computer there is nobody to wait for and this is always false.
   */
  readonly ready: Pair<boolean>;
  /** Null in a seat nobody has taken yet. */
  readonly seats: Pair<Seating | null>;
  /**
   * When the grace period for a missing player runs out, as epoch milliseconds,
   * or null when both are present. A timestamp rather than a remaining
   * duration, so a client that was itself asleep does not resume a stale count.
   */
  readonly waitingUntil: number | null;
}

export type ClientMessage =
  /**
   * Claims a seat.
   *
   * The token is the opaque value in `localStorage` that reclaims the same seat
   * after a reconnect (§2.2), and it stays the thing a seat is held by — an
   * account carries a record between devices, not a rubber in progress.
   *
   * `session` is the signed session, and it rides in this message rather than in
   * a header because a browser cannot set headers on a WebSocket. The server
   * verifies the signature before believing any of it. Since §3.7 an unsigned or
   * altered one no longer seats the player: taking a seat opposite a person
   * requires an account, and only a token already holding a seat gets back into
   * one without a working session.
   *
   * There is no name here on purpose. It used to sit beside the session, which
   * meant a seat could call itself anything at all — the server now reads the
   * name off the account it has just verified, for the same reason it has never
   * believed a claimed account id.
   */
  | {
      readonly type: "join";
      /**
       * How long this player would like the sitting to be.
       *
       * A preference, not a decision — the table has two of them and takes the
       * shorter, so a player who wants one game is never held in a rubber. It is
       * read only when the match starts; changing the setting mid-match cannot
       * move the goalposts, and a reconnecting player carries no authority over
       * a match already under way.
       */
      readonly format: MatchFormat;
      readonly session: string | null;
      readonly token: string;
    }
  | { readonly type: "action"; readonly action: DealAction }
  | { readonly type: "next-deal" }
  /**
   * Leaving on purpose, which is not the same as the socket dropping.
   *
   * Without this the two are indistinguishable, and the other player is shown
   * "waiting to reconnect" with a countdown for somebody who is not coming
   * back. Giving up the seat says so, and frees them to stop waiting.
   */
  | { readonly type: "leave" }
  /** Keeps the socket alive and proves the client is still there. */
  | { readonly type: "heartbeat" };

export type ServerMessage =
  /**
   * The whole of what this seat knows, sent as one message rather than as
   * deltas.
   *
   * A rubber is a few hundred actions and a snapshot is small, so there is
   * nothing to win by sending diffs — and plenty to lose. Every reconnect
   * becomes an ordinary state message instead of a replay protocol, and a
   * client that missed messages while its phone was locked cannot end up
   * quietly out of step, which on iOS is the normal case rather than the edge
   * one.
   */
  | {
      readonly type: "state";
      readonly seat: PlayerId;
      /** Null before both seats are filled and the first deal begins. */
      readonly snapshot: SessionSnapshot | null;
      readonly table: TableInfo;
    }
  /** A refused action, a full table, an unknown code. Never fatal on its own. */
  | { readonly type: "error"; readonly message: string };
