import { useCallback, useEffect, useState } from "react";
import { playerToken } from "./identity.js";
import { authUrl } from "./serverUrl.js";
import { clearStored, readStored, writeStored } from "./storage.js";

const SESSION_KEY = "hb.session";

export interface Account {
  readonly email: string;
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
export async function requestSignInLink(email: string): Promise<LinkRequestOutcome> {
  const response = await fetch(authUrl("request"), {
    body: JSON.stringify({ email }),
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
  const body = (await response.json()) as { email: string; session: string };
  writeStored(SESSION_KEY, body.session);
  return { email: body.email };
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
      setAccount(null);
    },
  };
}
