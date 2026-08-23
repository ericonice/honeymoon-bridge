// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { clearStuck, enqueue, flush, outboxState } from "../src/game/outbox.js";

vi.mock("../src/game/account.js", () => ({
  storedSession: (): string | null => session,
}));

let session: string | null = "token";

/** Every request the fake network has been asked to make. */
let sent: { readonly auth: string | null; readonly body: string; readonly url: string }[] = [];

/** Answers each call in turn; the last answer repeats once the list runs out. */
function respond(...answers: readonly (number | "offline")[]): void {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      sent.push({
        auth: (init.headers as Record<string, string>).Authorization ?? null,
        body: String(init.body),
        url,
      });
      const answer = answers[Math.min(call, answers.length - 1)] ?? 200;
      call += 1;
      if (answer === "offline") {
        return Promise.reject(new Error("network"));
      }
      return Promise.resolve({ ok: answer >= 200 && answer < 300, status: answer } as Response);
    }),
  );
}

const rubber = { body: '{"won":false}', kind: "Rubber lost", url: "/api/results/robot" };

beforeEach(() => {
  localStorage.clear();
  sent = [];
  session = "token";
  vi.stubGlobal("crypto", { randomUUID: () => `id-${Math.random()}` });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a report is on disk before it is sent, so a failed send does not lose it", async () => {
  respond("offline");
  enqueue({ ...rubber, withSession: false });
  await flush();

  // The old code swallowed this and the rubber was gone. It is still here.
  expect(outboxState().waiting).toHaveLength(1);
  expect(outboxState().waiting[0]!.status).toBe("offline");
  expect(outboxState().stuck).toHaveLength(0);

  // And the next time there is a network, it lands and leaves.
  respond(201);
  await flush();
  expect(outboxState().waiting).toHaveLength(0);
  expect(sent.at(-1)!.body).toBe(rubber.body);
});

/**
 * The sharper of the two gaps this closes. None of these calls used to look at
 * the response, so a body the server rejected was indistinguishable from one it
 * accepted — a result could vanish with the network working perfectly and nothing
 * logged anywhere.
 */
test("a server that refuses the body keeps it, marked, instead of dropping it", async () => {
  respond(400);
  enqueue({ ...rubber, withSession: false });
  await flush();

  expect(outboxState().waiting).toHaveLength(0);
  expect(outboxState().stuck).toHaveLength(1);
  expect(outboxState().stuck[0]!.status).toBe("HTTP 400");
  expect(outboxState().stuck[0]!.kind).toBe("Rubber lost");

  // Not retried — the same body will be refused identically forever.
  await flush();
  expect(sent).toHaveLength(1);

  clearStuck();
  expect(outboxState().stuck).toHaveLength(0);
});

test("a 401 waits for a session rather than being given up on", async () => {
  respond(401);
  enqueue({ ...rubber, withSession: false });
  await flush();

  expect(outboxState().stuck).toHaveLength(0);
  expect(outboxState().waiting[0]!.status).toBe("HTTP 401");
});

test("a report needing a session waits for one without spending an attempt", async () => {
  session = null;
  respond(200);
  enqueue({ body: '{"facts":1}', kind: "Deal achievements", url: "/api/a", withSession: true });
  await flush();

  expect(sent, "asked the server to file it with nobody signed in").toHaveLength(0);
  expect(outboxState().waiting[0]!.attempts).toBe(0);

  // Signing in is what makes it sendable, and the session is read at send time
  // rather than stored, so it is the current one.
  session = "fresh";
  await flush();
  expect(sent).toHaveLength(1);
  expect(sent[0]!.auth).toBe("Bearer fresh");
  expect(outboxState().waiting).toHaveLength(0);
});

test("one bad report does not block the ones behind it forever", async () => {
  respond(400, 201);
  enqueue({ ...rubber, kind: "Rubber lost", withSession: false });
  enqueue({ ...rubber, body: '{"won":true}', kind: "Rubber won", withSession: false });
  await flush();

  // The 400 settles on the first pass and the second report goes out behind it,
  // because a refused body is a fact about that body and not about the server.
  expect(outboxState().stuck.map((item) => item.kind)).toEqual(["Rubber lost"]);
  expect(outboxState().waiting).toHaveLength(0);
  expect(sent.map((item) => item.body)).toEqual([rubber.body, '{"won":true}']);
});

test("a dead network stops the queue rather than hammering it", async () => {
  respond("offline");
  enqueue({ ...rubber, withSession: false });
  enqueue({ ...rubber, body: '{"won":true}', kind: "Rubber won", withSession: false });
  await flush();

  // One attempt, not two: the second would tell us nothing the first did not.
  expect(sent).toHaveLength(1);
  expect(outboxState().waiting).toHaveLength(2);
});

test("what is waiting survives a reload, since it is only ever read from storage", async () => {
  respond("offline");
  enqueue({ ...rubber, withSession: false });
  await flush();

  const stored = localStorage.getItem("hb.outbox");
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!)).toHaveLength(1);

  // A fresh launch reads the same array and sends it.
  respond(201);
  await flush();
  expect(outboxState().waiting).toHaveLength(0);
});

/**
 * The worst failure this file can have: the caller has already marked the rubber
 * reported by the time `enqueue` runs, so a throw here loses the record with
 * nothing queued and nothing shown. `crypto.randomUUID` needs a secure context and
 * a new enough browser, and an id only has to be unique within one device's queue.
 */
test("a browser with no crypto.randomUUID still queues the report", async () => {
  vi.stubGlobal("crypto", {
    randomUUID: () => {
      throw new TypeError("not a function");
    },
  });
  respond(201);

  enqueue({ ...rubber, withSession: false });
  enqueue({ ...rubber, body: '{"won":true}', kind: "Rubber won", withSession: false });
  await flush();

  expect(sent.map((item) => item.body)).toEqual([rubber.body, '{"won":true}']);
  expect(outboxState().waiting).toHaveLength(0);
});
