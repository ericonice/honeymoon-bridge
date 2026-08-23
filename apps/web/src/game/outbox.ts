import { storedSession } from "./account.js";
import { readStored, writeStored } from "./storage.js";

const KEY = "hb.outbox";

/**
 * How many unsent reports to keep. Reached only by somebody who has played a
 * great many deals with no working network, where the oldest are the least worth
 * keeping — a rubber result is worth more than a hand log from a week ago, and
 * both are worth more than nothing.
 */
const LIMIT = 60;

/** Tries before a report is left alone. Roughly a week of ordinary app launches. */
const MAX_ATTEMPTS = 12;

/**
 * A report that has happened and now has to reach the server.
 *
 * Everything here is a *record of something already played*, which is the whole
 * reason this exists: the game deliberately never waits on the network, so a
 * failed send used to mean a rubber that happened and was never written down.
 *
 * The session is deliberately **not** stored. It is read again at send time, so a
 * token that has since been renewed is used rather than a stale one.
 */
export interface Pending {
  readonly attempts: number;
  readonly body: string;
  /** Named for the diagnosis row in Settings, not used in the request. */
  readonly kind: string;
  readonly id: string;
  /** True once the server has refused this body in a way retrying cannot fix. */
  readonly permanent: boolean;
  readonly queuedAt: number;
  /** What happened last time, verbatim enough to tell a 400 from being offline. */
  readonly status: string;
  readonly url: string;
  /** Whether the request is worth making at all without a signed-in session. */
  readonly withSession: boolean;
}

/**
 * An id for one queued report, and never a throw.
 *
 * `crypto.randomUUID` is not everywhere — it needs a secure context and a browser
 * new enough — and a throw here would be the worst possible failure: the caller has
 * already marked the rubber as reported, so the record would be lost with nothing
 * queued and nothing shown. Only uniqueness within this device's queue matters, and
 * the counter alone gives that.
 */
let counter = 0;
function newId(): string {
  counter += 1;
  try {
    return crypto.randomUUID();
  } catch {
    return `q-${Date.now()}-${counter}`;
  }
}

function read(): readonly Pending[] {
  const raw = readStored(KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Pending[]) : [];
  } catch {
    // A half-written or hand-edited value is not worth failing a launch over.
    return [];
  }
}

function write(items: readonly Pending[]): void {
  writeStored(KEY, JSON.stringify(items.slice(-LIMIT)));
}

/**
 * Whether a status is worth trying again.
 *
 * A body the server has read and refused will be refused identically forever, so
 * retrying a 400 is a loop that never ends and never succeeds. 401 is the
 * exception among the four-hundreds: the request was fine and the session was
 * not, which the next sign-in fixes. 408 and 429 are explicitly "later".
 */
function worthRetrying(status: number): boolean {
  if (status === 401 || status === 408 || status === 429) {
    return true;
  }
  return status >= 500;
}

/**
 * Queues a report and tries to send it now.
 *
 * Written down *before* the request goes out, which is the point: a rubber that
 * finished is on disk before anything can go wrong with delivering it, so the
 * worst case is that it arrives late rather than never.
 */
export function enqueue(item: {
  readonly body: string;
  readonly kind: string;
  readonly url: string;
  readonly withSession: boolean;
}): void {
  write([
    ...read(),
    {
      attempts: 0,
      body: item.body,
      id: newId(),
      kind: item.kind,
      permanent: false,
      queuedAt: Date.now(),
      status: "queued",
      url: item.url,
      withSession: item.withSession,
    },
  ]);
  void flush();
}

/**
 * The pass currently running, if any.
 *
 * A second caller joins it rather than being turned away. Returning early instead
 * — which is what this did first — makes `flush()` a promise that can resolve
 * before anything has been sent, so a caller who awaits it and then reads the
 * queue can see a state the in-flight pass is about to overwrite.
 */
let running: Promise<void> | null = null;

/**
 * Sends whatever is waiting, oldest first.
 *
 * `keepalive` is what lets a send survive the page going away, which matters
 * because the most likely moment for one of these is the end of a rubber — which
 * is exactly when somebody puts the phone down or switches app. It caps the body
 * at 64KB; a hand log is the only thing here that comes close, and it is well
 * under.
 *
 * Serial rather than parallel, and stopping at the first thing that fails: if the
 * network is down, the second attempt tells us nothing the first did not, and
 * hammering a server that just returned a 500 is not how to help it.
 */
export function flush(): Promise<void> {
  running ??= drain().finally(() => {
    running = null;
  });
  return running;
}

/**
 * One pass: the oldest sendable report, then the next, until nothing is left that
 * this pass has not already tried.
 *
 * **Re-read each step rather than iterating a snapshot.** A rubber finishing
 * enqueues *and* triggers a pass, and the deal's achievements land a moment later
 * while that pass is still awaiting its first response — against a snapshot the
 * second report would sit there until some later trigger, which is the whole
 * failure mode this file exists to remove. `tried` is what still guarantees the
 * loop ends: every turn either settles a report or marks it seen.
 */
async function drain(): Promise<void> {
  const tried = new Set<string>();
  for (;;) {
    const session = storedSession();
    const next = read().find(
      (item) =>
        !tried.has(item.id) &&
        !item.permanent &&
        item.attempts < MAX_ATTEMPTS &&
        // Not a failure and not an attempt — there is simply nobody to file it
        // under yet. Signing in is what makes this sendable.
        !(item.withSession && session === null),
    );
    if (next === undefined) {
      return;
    }
    tried.add(next.id);
    if (!(await send(next, session))) {
      return;
    }
  }
}

/** True if the queue should keep going: this one is settled, one way or the other. */
async function send(item: Pending, session: string | null): Promise<boolean> {
  let status: string;
  let settled: boolean;
  let keepGoing: boolean;

  try {
    const response = await fetch(item.url, {
      body: item.body,
      headers: {
        "Content-Type": "application/json",
        ...(session === null ? {} : { Authorization: `Bearer ${session}` }),
      },
      keepalive: true,
      method: "POST",
    });
    // The gap this closes: none of these calls used to look at the response at
    // all, so a rejected body and a delivered one were indistinguishable and a
    // record could vanish with the network working perfectly.
    if (response.ok) {
      drop(item.id);
      return true;
    }
    status = `HTTP ${response.status}`;
    settled = !worthRetrying(response.status);
    keepGoing = response.status < 500;
  } catch {
    status = "offline";
    settled = false;
    keepGoing = false;
  }

  update(item.id, status, settled);
  return keepGoing;
}

function drop(id: string): void {
  write(read().filter((item) => item.id !== id));
}

function update(id: string, status: string, permanent: boolean): void {
  write(
    read().map((item) =>
      item.id === id ? { ...item, attempts: item.attempts + 1, permanent, status } : item,
    ),
  );
}

export interface OutboxState {
  /** Given up on: the server read the body and refused it, or it ran out of tries. */
  readonly stuck: readonly Pending[];
  /** Still expected to land, on the next launch or the next network. */
  readonly waiting: readonly Pending[];
}

/**
 * What is unsent, for the row in Settings that shows it.
 *
 * This is the answer to "can we add logging": a report that never arrived is
 * *here*, with what the server said about it, instead of having vanished into a
 * swallowed catch. An empty outbox alongside a missing record means the loss was
 * on the server side, which is a different search.
 */
export function outboxState(): OutboxState {
  const items = read();
  return {
    stuck: items.filter((item) => item.permanent || item.attempts >= MAX_ATTEMPTS),
    waiting: items.filter((item) => !item.permanent && item.attempts < MAX_ATTEMPTS),
  };
}

/** Throws away what is stuck. Only reachable from the testing panel. */
export function clearStuck(): void {
  const { waiting } = outboxState();
  write(waiting);
}

let started = false;

/**
 * Starts draining, and keeps draining at the three moments something might have
 * changed: the app opening, the network coming back, and the tab being looked at
 * again — which on a phone is the one that fires after the app was suspended
 * mid-send.
 */
export function startOutbox(): void {
  if (started || typeof window === "undefined") {
    return;
  }
  started = true;
  window.addEventListener("online", () => {
    void flush();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void flush();
    }
  });
  void flush();
}
