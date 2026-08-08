import { useState } from "react";
import type { Account } from "../game/account.js";
import { requestSignInLink } from "../game/account.js";

export interface AccountPanelProps {
  readonly account: Account | null;
  readonly checking: boolean;
  onSignOut(): void;
}

function looksLikeEmail(value: string): boolean {
  // The same deliberately loose test the server applies. What really proves an
  // address is good is that the link arrives at it.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function SignedIn({
  email,
  onSignOut,
}: {
  readonly email: string;
  onSignOut(): void;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-white/15 px-4 py-3">
      <span className="block text-xs tracking-wide text-white/45 uppercase">Signed in as</span>
      <span className="mt-0.5 block truncate text-base font-medium">{email}</span>
      <button
        type="button"
        className="mt-2 text-sm text-white/50 underline underline-offset-4"
        onClick={onSignOut}
      >
        Sign out
      </button>
    </div>
  );
}

function Sent({ email, onAgain }: { readonly email: string; onAgain(): void }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-white/15 px-4 py-3">
      <span className="block text-base font-medium">Check your inbox</span>
      <p className="mt-0.5 text-xs text-white/55">
        A sign-in link is on its way to {email}. It works once and expires in ten minutes. If it has
        not turned up in a few minutes, it is worth a look in spam.
      </p>
      <button
        type="button"
        className="mt-2 text-sm text-white/50 underline underline-offset-4"
        onClick={onAgain}
      >
        Use a different address
      </button>
    </div>
  );
}

/**
 * Signing in, which is optional and says so.
 *
 * Nothing here gates a game — the point of an account is that a record outlives
 * the browser it was made in, not that anyone needs one to play. The copy has to
 * carry that, or a sign-in field at the top of Settings reads like a wall.
 */
export function AccountPanel({
  account,
  checking,
  onSignOut,
}: AccountPanelProps): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (): Promise<void> => {
    const address = email.trim();
    setSending(true);
    setError(null);
    try {
      const outcome = await requestSignInLink(address);
      if (outcome.ok) {
        setSentTo(address);
      } else {
        // The server's own words, because it knows which of several things went
        // wrong and this screen does not. Claiming a link is on its way when it
        // is not is the one thing this must never do.
        setError(outcome.message);
      }
    } catch {
      setError("Could not reach the server. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  if (checking) {
    return <p className="text-sm text-white/40">Checking your account…</p>;
  }

  if (account !== null) {
    return <SignedIn email={account.email} onSignOut={onSignOut} />;
  }

  if (sentTo !== null) {
    return (
      <Sent
        email={sentTo}
        onAgain={() => {
          setSentTo(null);
        }}
      />
    );
  }

  return (
    <div>
      <label className="block">
        <span className="text-xs tracking-wide text-white/45 uppercase">Email</span>
        <input
          className="mt-1 w-full rounded-xl border border-white/25 bg-black/20 px-4 py-3 text-base"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
      </label>

      <button
        type="button"
        className="mt-2 w-full rounded-xl border border-white/25 px-4 py-3 text-base text-white disabled:opacity-35"
        disabled={sending || !looksLikeEmail(email)}
        onClick={() => {
          void send();
        }}
      >
        {sending ? "Sending…" : "Send a sign-in link"}
      </button>

      <p className="mt-1 text-xs text-white/40">
        No password. We send a link, you open it. Signing in keeps your games when you clear your
        browser or pick up another phone — you never need one to play.
      </p>

      {error === null ? null : <p className="mt-1 text-sm text-amber-200">{error}</p>}
    </div>
  );
}
