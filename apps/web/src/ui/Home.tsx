import { useState } from "react";
import type { Account } from "../game/account.js";
import { storedSession } from "../game/account.js";
import { createTableUrl } from "../game/serverUrl.js";

export interface HomeProps {
  /** Null when signed out, which is most of what this screen has to say. */
  readonly account: Account | null;
  readonly checkingAccount: boolean;
  onFindOpponent(): void;
  onJoinTable(code: string): void;
  onPlayComputer(): void;
  onShowAccount(): void;
  onShowRecord(): void;
  onShowSettings(): void;
  onSignIn(): void;
}

/**
 * Who you are, at the top of the screen rather than inside Settings.
 *
 * Settings is a list of things to change and every other row in it is a toggle;
 * being signed in is neither a preference nor a thing you set, and since §3.7 it
 * is what stands between somebody and half of what this app does. Hiding that
 * behind a gear made the app's answer to "why can't I play?" a place nobody
 * would think to look.
 */
function Identity({
  account,
  checking,
  onShowAccount,
  onSignIn,
}: {
  readonly account: Account | null;
  readonly checking: boolean;
  onShowAccount(): void;
  onSignIn(): void;
}): React.JSX.Element {
  if (checking) {
    return <p className="text-sm text-white/40">Checking your account…</p>;
  }

  if (account === null) {
    return (
      <button
        type="button"
        className="w-full rounded-xl border border-white/25 px-4 py-3 text-left"
        onClick={onSignIn}
      >
        <span className="block text-base font-medium">Sign in</span>
        <span className="mt-0.5 block text-xs text-white/55">
          Needed to play another person. The computer never asks.
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="w-full rounded-xl border border-white/15 px-4 py-3 text-left"
      onClick={onShowAccount}
    >
      <span className="block text-xs tracking-wide text-white/45 uppercase">Playing as</span>
      <span className="mt-0.5 block truncate text-base font-medium">
        {account.name ?? "Choose a name"}
      </span>
    </button>
  );
}

function Choice({
  description,
  disabled,
  label,
  onClick,
  primary,
}: {
  readonly description: string;
  readonly disabled?: boolean;
  readonly label: string;
  readonly primary?: boolean;
  onClick(): void;
}): React.JSX.Element {
  const tone =
    primary === true
      ? "bg-white text-stone-900"
      : "border border-white/25 text-white disabled:opacity-35";

  return (
    <button
      type="button"
      className={`w-full rounded-xl px-4 py-4 text-left ${tone}`}
      disabled={disabled === true}
      onClick={onClick}
    >
      <span className="block text-lg font-semibold">{label}</span>
      <span
        className={`mt-0.5 block text-xs ${primary === true ? "text-stone-600" : "text-white/55"}`}
      >
        {description}
      </span>
    </button>
  );
}

/**
 * The first screen.
 *
 * The app used to open straight into a deal against the computer, which was
 * right while that was the only thing it could do. With a second mode there is
 * a choice to make before anything can start, and burying it inside a game in
 * progress would make the networked game the hidden one.
 */
export function Home({
  account,
  checkingAccount,
  onFindOpponent,
  onJoinTable,
  onPlayComputer,
  onShowAccount,
  onShowRecord,
  onShowSettings,
  onSignIn,
}: HomeProps): React.JSX.Element {
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startTable = async (): Promise<void> => {
    // Minting a code needs an account, so ask before spending a round trip on
    // being refused. Joining a table or the queue is gated on the way in to
    // that screen instead, where the destination is worth keeping hold of.
    const session = storedSession();
    if (session === null) {
      onSignIn();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(createTableUrl(), {
        headers: { Authorization: `Bearer ${session}` },
        method: "POST",
      });
      if (!response.ok) {
        onSignIn();
        return;
      }
      const body = (await response.json()) as { code: string };
      onJoinTable(body.code);
    } catch {
      setError("Could not reach the table server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 py-8">
      <div>
        <h1 className="text-3xl font-semibold">Honeymoon Bridge</h1>
        <p className="mt-1 text-sm text-white/55">Contract bridge for two.</p>
      </div>

      <div className="flex flex-col gap-3 py-6">
        <Choice
          primary
          label="Play the computer"
          description="On this device. Works offline, and needs nobody else."
          onClick={onPlayComputer}
        />

        <Identity
          account={account}
          checking={checkingAccount}
          onShowAccount={onShowAccount}
          onSignIn={onSignIn}
        />

        <Choice
          label="Find an opponent"
          description="Get put together with whoever else is looking for a game."
          onClick={onFindOpponent}
        />

        <Choice
          label="Start a table"
          description="Create a table and send one particular person the link."
          disabled={busy}
          onClick={() => {
            void startTable();
          }}
        />

        {joining ? (
          <div className="flex gap-2">
            <input
              autoFocus
              className="min-w-0 flex-1 rounded-xl border border-white/25 bg-black/20 px-4 py-3 font-mono text-lg tracking-[0.2em] uppercase"
              placeholder="CODE"
              value={code}
              maxLength={6}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
              }}
            />
            <button
              type="button"
              className="rounded-xl bg-white px-5 text-base font-semibold text-stone-900 disabled:opacity-35"
              disabled={code.length !== 6}
              onClick={() => {
                onJoinTable(code);
              }}
            >
              Join
            </button>
          </div>
        ) : (
          <Choice
            label="Join a table"
            description="Enter a code, or just open the link you were sent."
            onClick={() => {
              setJoining(true);
            }}
          />
        )}

        {error === null ? null : <p className="text-sm text-amber-200">{error}</p>}
      </div>

      <div className="flex gap-5">
        <button
          type="button"
          className="text-sm text-white/50 underline underline-offset-4"
          onClick={onShowSettings}
        >
          Settings
        </button>
        <button
          type="button"
          className="text-sm text-white/50 underline underline-offset-4"
          onClick={onShowRecord}
        >
          Your record
        </button>
      </div>
    </div>
  );
}
