import { useRef, useState } from "react";
import { devSignIn, redeemSignInCode, requestSignInLink, standalone } from "../game/account.js";
import type { Destination } from "../game/destination.js";
import { rememberDestination } from "../game/destination.js";

export interface SignInWallProps {
  readonly destination: Destination;
  onBack(): void;
  /** Called once a session exists, so the screen behind can be reconsidered. */
  onSignedIn(): void;
}

function looksLikeEmail(value: string): boolean {
  // The same deliberately loose test the server applies. What really proves an
  // address is good is that the link arrives at it.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * What this screen is standing in front of.
 *
 * Somebody who tapped an invite is in the middle of something and should be
 * told that this is the way back to it, rather than shown a bare email box and
 * left to wonder where the table went.
 */
function asking(destination: Destination): { readonly body: string; readonly title: string } {
  switch (destination.kind) {
    case "home": {
      return {
        body: "Playing against another person needs an account, so a game can be recorded against the person you played rather than against a browser. The game against the computer never does.",
        title: "Sign in",
      };
    }
    case "queue": {
      return {
        body: "Finding an opponent needs an account. It is how the result ends up on your record against them afterwards, which is the only reason it is asked for.",
        title: "Sign in to find an opponent",
      };
    }
    case "table": {
      return {
        body: `Table ${destination.code} is waiting for you. Signing in takes an email and a short code, and you come straight back here.`,
        title: "Sign in to join the table",
      };
    }
  }
}

/**
 * The account gate (§3.7).
 *
 * The destination is stored before the link is asked for and also travels
 * inside the link, so the table somebody was invited to survives the round trip
 * whichever browser ends up opening the mail.
 */
export function SignInWall({
  destination,
  onBack,
  onSignedIn,
}: SignInWallProps): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const spending = useRef(false);
  // Read once. Whether this is an installed app cannot change under a person
  // while they are reading the screen that explains it.
  const [installed] = useState(standalone);

  const send = async (): Promise<void> => {
    const address = email.trim();
    setSending(true);
    setError(null);
    rememberDestination(destination);
    try {
      const outcome = await requestSignInLink(address, destination);
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

  const enterCode = async (): Promise<void> => {
    // A code works exactly once, so a second submission of one that has already
    // been spent is a real failure — and reporting it would be telling somebody
    // their sign-in broke at the moment it succeeded. Disabling the button is
    // not enough on its own: two taps can land before the first render that
    // disables it.
    if (sentTo === null || spending.current) {
      return;
    }
    spending.current = true;
    setChecking(true);
    setError(null);
    try {
      const account = await redeemSignInCode(sentTo, code);
      if (account === null) {
        setError("That code did not work. Check it, or ask for another.");
        spending.current = false;
        return;
      }
      // Deliberately still held. This screen is on its way out, and a code that
      // worked must not be offered to the server a second time.
      onSignedIn();
    } catch {
      setError("Could not reach the server. Try again in a moment.");
      spending.current = false;
    } finally {
      setChecking(false);
    }
  };

  const asDev = async (address: string): Promise<void> => {
    const account = await devSignIn(address);
    if (account === null) {
      setError("The dev sign-in is not available here.");
      return;
    }
    onSignedIn();
  };

  const { body, title } = asking(destination);

  if (sentTo !== null) {
    return (
      <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Enter the code</h1>
          <p className="mt-2 text-sm text-white/55">
            An email is on its way to {sentTo} with a six-character code in the subject line. Type
            it here and you are in — it works once and expires in ten minutes.
          </p>
          {installed ? (
            <p className="mt-2 text-sm text-white/40">
              There is no link in it. You added this app to your home screen, and iOS would open a
              link in Safari instead — signing that in and leaving this exactly as it is.
            </p>
          ) : (
            <p className="mt-2 text-sm text-white/40">
              The email has a link too, if you would rather tap it. Either one works.
            </p>
          )}
        </div>

        <div className="py-6">
          <input
            autoFocus
            className="w-full rounded-xl border border-white/25 bg-black/20 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] uppercase"
            inputMode="text"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="CODE"
            value={code}
            maxLength={7}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              setError(null);
            }}
          />
          <button
            type="button"
            className="mt-2 w-full rounded-xl bg-white px-4 py-3 text-base font-semibold text-stone-900 disabled:opacity-35"
            disabled={checking || code.replace(/[\s-]/g, "").length !== 6}
            onClick={() => {
              void enterCode();
            }}
          >
            {checking ? "Checking…" : "Sign in"}
          </button>
          {error === null ? null : <p className="mt-1 text-sm text-amber-200">{error}</p>}
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="w-full rounded-xl border border-white/25 px-4 py-3 text-base"
            onClick={() => {
              setSentTo(null);
              setCode("");
              setError(null);
              spending.current = false;
            }}
          >
            Use a different address
          </button>
          <button
            type="button"
            className="text-sm text-white/50 underline underline-offset-4"
            onClick={onBack}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-white/55">{body}</p>
      </div>

      <div className="py-6">
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
          className="mt-2 w-full rounded-xl bg-white px-4 py-3 text-base font-semibold text-stone-900 disabled:opacity-35"
          disabled={sending || !looksLikeEmail(email)}
          onClick={() => {
            void send();
          }}
        >
          {sending ? "Sending…" : "Email me a sign-in code"}
        </button>

        <p className="mt-1 text-xs text-white/40">
          No password. We email you a six-character code, you type it in, and this device stays
          signed in for a year.
          {installed ? "" : " There is a link in the email too, if you would rather tap it."}
        </p>

        {error === null ? null : <p className="mt-1 text-sm text-amber-200">{error}</p>}

        {/* Compiled out of anything that is not `vite dev`, and refused by a
            server the dev script did not start. Two seats otherwise cost two
            emails every time an incognito window is closed — see §3.6. */}
        {import.meta.env.DEV ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/20 px-4 py-3">
            <span className="block text-xs tracking-wide text-white/45 uppercase">Dev only</span>
            <div className="mt-2 flex gap-2">
              {["one", "two"].map((which) => (
                <button
                  key={which}
                  type="button"
                  className="flex-1 rounded-lg border border-white/25 px-3 py-2 text-sm"
                  onClick={() => {
                    void asDev(
                      looksLikeEmail(email) ? email.trim() : `dev-${which}@example.com`,
                    );
                  }}
                >
                  Sign in as {which}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="text-sm text-white/50 underline underline-offset-4"
        onClick={onBack}
      >
        Back
      </button>
    </div>
  );
}
