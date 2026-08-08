/**
 * Being paired with whoever else is waiting, rather than being sent a link.
 *
 * §2.2 built table creation around an invite because the game is for people who
 * already know each other, and deferred a queue as "a possible later addition".
 * This is that addition. It does not replace invites — a link is still the only
 * way to reach one particular person.
 *
 * It runs over its own socket rather than as a request that waits, because the
 * useful states are "still waiting" and "gave up", and a socket expresses both:
 * closing it *is* leaving the queue, so nobody is left holding a place they
 * have walked away from.
 */
export type LobbyClientMessage =
  /**
   * Join the queue. The token is the same one that identifies a seat, and the
   * session is the same one sent when joining a table — carried here so the
   * queue can decline to pair somebody with themselves across two devices they
   * are signed in on, which a token alone cannot detect.
   *
   * A session that does not verify is refused rather than queued anonymously.
   * The queue is where two people who do not know each other are put together,
   * and a result is the only thing either of them takes away from it.
   */
  | {
      readonly type: "queue";
      readonly session: string | null;
      readonly token: string;
    }
  | { readonly type: "heartbeat" };

export type LobbyServerMessage =
  /** In the queue, with this many others also waiting. */
  | { readonly type: "waiting"; readonly waiting: number }
  /** Paired. Both players are sent the same code and go to that table. */
  | { readonly type: "matched"; readonly code: string }
  | { readonly type: "error"; readonly message: string };
