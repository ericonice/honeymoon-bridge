import { useCallback, useEffect, useState } from "react";
import type { Destination } from "./destination.js";
import { destinationToWire } from "./destination.js";
import { playerToken, resetPlayerToken } from "./identity.js";
import { authUrl } from "./serverUrl.js";
import { clearStored, readStored, writeStored } from "./storage.js";

const SESSION_KEY = "hb.session";

export interface Account {
  readonly email: string;
  /**
   * What other players see. Null until it has been asked for, which is the
   * first thing after a first sign-in — the server refuses a seat without one,
   * because a name is shown across the table and kept on every result.
   */
  readonly name: string | null;
}

/** The signed session this device holds, or null if it has never signed in. */
export function storedSession(): string | null {
  const session = readStored(SESSION_KEY);
  return session === null || session === "" ? null : session;
}

export function clearSession(): void {
  clearStored(SESSION_KEY);
}

export type LinkRequestOutcome =
  | { readonly message: string; readonly ok: false }
  | { readonly ok: true };

/**
 * Asks the server to send a sign-in link.
 *
 * Success is only ever an acknowledgement: the server will not say whether the
 * address is one it already knows, so this cannot report it either, and the
 * screen must not imply an answer it was never given.
 *
 * A refusal it *will* explain — mail it could not send, or links asked for too
 * often — comes back as a message meant to be shown as-is. A network failure
 * throws instead, so the two are never confused: one is the server talking and
 * the other is not reaching it.
 */
/**
 * Whether this is the app installed to a home screen rather than a browser tab.
 *
 * It decides what the email should contain. On iOS an installed app has its own
 * storage, so a link opened from Mail signs *Safari* in and leaves the app
 * exactly as it was — with the link spent, since one works only once. Telling
 * the server means it can send the code alone and not offer something that
 * cannot work.
 */
export function standalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS predates the standard media query and still reports it here.
    ("standalone" in window.navigator && window.navigator.standalone === true)
  );
}

export async function requestSignInLink(
  email: string,
  destination: Destination,
): Promise<LinkRequestOutcome> {
  const response = await fetch(authUrl("request"), {
    // Where to come back to travels with the request so the server can put it
    // in the link. A link opened on a different device than asked from has no
    // other way of knowing there was a table waiting.
    body: JSON.stringify({
      email,
      standalone: standalone(),
      to: destinationToWire(destination),
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (response.ok) {
    return { ok: true };
  }

  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return {
    message: typeof body.error === "string" ? body.error : "Could not send a link just now.",
    ok: false,
  };
}

/**
 * Spends a sign-in link and keeps the session it returns.
 *
 * Null means the server looked at the link and refused it: expired, already
 * used, or never real. A network failure throws instead, because the two are
 * worth telling apart — one is worth trying again and the other never will be.
 *
 * The anonymous device token goes along so the account claims it. Whoever has
 * been playing on this phone keeps what they have played.
 */
export async function redeemSignInToken(token: string): Promise<Account | null> {
  const response = await fetch(authUrl("verify"), {
    body: JSON.stringify({ deviceToken: playerToken(), token }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    return null;
  }
  return keep(await response.json());
}

/**
 * Spends a code typed in from the email.
 *
 * The address goes with it because the server looks the code up by both — six
 * characters are only enough when a guess has to arrive with the right address
 * attached. This screen has the address already; it is what was typed to ask
 * for the code in the first place.
 *
 * Null means the server looked and refused. A network failure throws, so the
 * screen can tell "that code is wrong" from "I could not ask".
 */
export async function redeemSignInCode(email: string, code: string): Promise<Account | null> {
  const response = await fetch(authUrl("code"), {
    body: JSON.stringify({ code, deviceToken: playerToken(), email }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return response.ok ? keep(await response.json()) : null;
}

/** Takes a signed-in response and holds on to the session it came with. */
function keep(body: unknown): Account {
  const { email, name, session } = body as {
    email: string;
    name: string | null;
    session: string;
  };
  writeStored(SESSION_KEY, session);
  return { email, name };
}

/**
 * Signs in without the email round trip, for the development loop only.
 *
 * Two-player testing is a window and an incognito window, and incognito forgets
 * its session whenever it closes — so with an account required to play a
 * person, every run would otherwise start with two emails (§3.6).
 *
 * Compiled out of any build that is not `vite dev`, *and* refused by a server
 * that was not started by the `dev` script. Two conditions rather than one,
 * because this is the single dev control that would be an authentication bypass
 * if it ever shipped: the others are safe in production precisely because the
 * server refuses them, and refusing this one would leave it doing nothing.
 */
export async function devSignIn(email: string): Promise<Account | null> {
  if (!import.meta.env.DEV) {
    return null;
  }
  const response = await fetch(authUrl("dev"), {
    body: JSON.stringify({ deviceToken: playerToken(), email }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return response.ok ? keep(await response.json()) : null;
}

/** Sets the name other players see. Returns false if the server refused it. */
export async function setAccountName(name: string): Promise<boolean> {
  const session = storedSession();
  if (session === null) {
    return false;
  }
  const response = await fetch(authUrl("name"), {
    body: JSON.stringify({ name }),
    headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
    method: "POST",
  });
  return response.ok;
}

/**
 * Who this device is signed in as, according to the server.
 *
 * A session the server no longer accepts is dropped here rather than left to
 * fail somewhere less obvious later. The signing secret can be rotated, and when
 * it is, every session in existence becomes a string that will never work again.
 */
export async function currentAccount(): Promise<Account | null> {
  const session = storedSession();
  if (session === null) {
    return null;
  }

  const response = await fetch(authUrl("me"), {
    headers: { Authorization: `Bearer ${session}` },
  });
  if (!response.ok) {
    throw new Error(`account lookup failed: ${response.status}`);
  }

  const body = (await response.json()) as { account: Account | null };
  if (body.account === null) {
    clearSession();
  }
  return body.account;
}

export interface AccountState {
  /** Null while signed out, and also while the first check is still out. */
  readonly account: Account | null;
  readonly checking: boolean;
  refresh(): void;
  signOut(): void;
}

/**
 * The signed-in account, checked against the server on load.
 *
 * A failed check leaves the stored session alone. Being offline is not evidence
 * that a session has gone bad, and throwing one away on a bad connection would
 * mean going to find the email again — which is the one thing an account is
 * supposed to save you from.
 */
export function useAccount(): AccountState {
  const [account, setAccount] = useState<Account | null>(null);
  const [checking, setChecking] = useState(storedSession() !== null);

  const refresh = useCallback((): void => {
    if (storedSession() === null) {
      setAccount(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    void currentAccount()
      .then((next) => {
        setAccount(next);
      })
      .catch(() => {
        // Offline, or the server is down. Say nothing and keep the session.
      })
      .finally(() => {
        setChecking(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    account,
    checking,
    refresh,
    signOut: () => {
      clearSession();
      // The account that just left has claimed this device's token. Keeping it
      // would give whoever signs in next the previous person's anonymous games.
      resetPlayerToken();
      setAccount(null);
    },
  };
}
