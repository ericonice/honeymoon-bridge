import type {
  DealAction,
  DuplicateSchedule,
  MatchFormat,
  Pair,
  PlayerId,
  RubberFormat,
  Unlock,
} from "@hb/engine";
import type { SessionSnapshot } from "./snapshot.js";

/**
 * What this build of the wire protocol expects. Both ends deployed in one
 * command for as long as the server and the browser were the only two hosts —
 * a stale client was a service-worker problem fixed by shipping. An app binary
 * changes that: a TestFlight tester who has not updated is a client whose
 * deploy nobody controls, and the failure without this was silent
 * misbehaviour rather than an error (see `CLAUDE.md`, the Pages/Worker
 * mismatch that cost an afternoon).
 *
 * The server accepts this version and the one before it — see `#join` — so
 * bumping it is only ever required when a change to `ClientMessage` or
 * `ServerMessage` would otherwise be misread by the other end, the same
 * discipline `halfFormat` and its siblings already follow by staying optional
 * with a default instead.
 */
export const PROTOCOL_VERSION = 1;

/** How a seat is identified across a dropped socket. */
export interface Seating {
  readonly connected: boolean;
  readonly nickname: string;
}

/**
 * How this player arrived at the table: having minted the code and sent it, or
 * having been sent one.
 *
 * Absent for a queue match, where a stranger is not an invitee — pairing there
 * is symmetric between two people who asked to be matched, and nothing about
 * that ordering resembles one of them inviting the other. See `formatFor`.
 */
export type TableRole = "guest" | "host";

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
       * What this client's build of the wire protocol is — see
       * `PROTOCOL_VERSION`. Required rather than optional like the preference
       * fields below: a client old enough to have no opinion on `halfFormat`
       * is a client this can still talk to, but a client old enough to
       * predate this field entirely is exactly the one an `outdated` refusal
       * exists for, and a missing value has to read as the oldest version
       * there is rather than as silently compatible.
       */
      readonly protocol: number;
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
      /**
       * How long a duplicate session this player wants, in deals.
       *
       * Only consulted when *both* seats asked for duplicate — see `formatFor`. Absent
       * from a client too old to ask for one, which reads as no preference rather than
       * as a length of zero.
       */
      readonly sessionDeals?: number;
      /**
       * How this player wants a session's deals ordered.
       *
       * Consulted only when both seats asked for duplicate *and* asked for the same
       * order — see `formatFor`. Absent from a client too old to have an opinion.
       */
      readonly sessionOrder?: DuplicateSchedule;
      /**
       * What each half of a two-game match runs to: one game, or a rubber.
       *
       * Consulted only when both seats asked for a mirror — see `formatFor` — and
       * then the *shorter* wins, on the same reasoning a single game beats a rubber.
       * Absent from a client too old to ask, which reads as no preference rather than
       * as a rubber a side.
       */
      readonly halfFormat?: RubberFormat;
      /**
       * Whether this seat minted the code or was handed one — see `TableRole`.
       *
       * Absent from a queue match and from a client too old to say, both of
       * which read as "no invite" rather than as a guess: `formatFor` falls
       * back to its ordinary precedence exactly as it always has whenever
       * neither seat, or both, claim to be the guest.
       */
      readonly role?: TableRole;
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
  | { readonly type: "error"; readonly message: string }
  /**
   * Achievements this seat — and only this seat — just unlocked.
   *
   * Sent to one socket, never broadcast: an unlock can say something about the
   * hand that earned it (Two-Suiter, most obviously), so it is exactly as
   * private as the hand itself and must never reach the other seat.
   */
  | { readonly type: "achievements"; readonly unlocked: readonly Unlock[] }
  /**
   * This client's `protocol` is too old for the server to trust. Distinct
   * from `error`, which is a refusal the player can act on (a full table, a
   * wrong code) — nothing this player does closes the gap here, so the
   * client renders a plain "update the app" screen rather than the ordinary
   * error message.
   */
  | { readonly type: "outdated" };
