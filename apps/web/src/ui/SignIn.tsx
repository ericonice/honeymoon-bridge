import { useEffect, useRef, useState } from "react";
import { redeemSignInToken } from "../game/account.js";

export interface SignInProps {
  readonly token: string;
  /** Called when the player is finished with this screen, however it went. */
  onDone(): void;
}

type State =
  | { readonly kind: "failed" }
  | { readonly kind: "refused" }
  | { readonly kind: "signed-in"; readonly email: string }
  | { readonly kind: "working" };

function message(state: State): { readonly body: string; readonly title: string } {
  switch (state.kind) {
    case "failed": {
      return {
        body: "The link could not be checked. That usually means no connection rather than anything wrong with the link, so it is worth opening again once you are back online.",
        title: "Could not reach the server",
      };
    }
    case "refused": {
      return {
        body: "A sign-in link works once and lasts ten minutes. Asking for another takes a moment, and it will bring you back to wherever you were headed.",
        title: "That link has expired",
      };
    }
    case "signed-in": {
      return {
        body: `Signed in as ${state.email}. Games played on this device stay with you now, on any device you sign in on.`,
        title: "You're in",
      };
    }
    case "working": {
      return { body: "One moment.", title: "Signing you in" };
    }
  }
}

/**
 * What a sign-in link opens onto.
 *
 * It spends the token immediately rather than waiting to be told to, because
 * arriving here *is* the confirmation — the link was in an inbox only this
 * person can read, and asking them to press a second button proves nothing.
 */
export function SignIn({ onDone, token }: SignInProps): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: "working" });
  const spent = useRef(false);

  useEffect(() => {
    // A link works exactly once, and React runs this effect twice in
    // development. Without the guard the second run finds a token already spent
    // — by us, a moment earlier — and truthfully reports it as used.
    if (spent.current) {
      return;
    }
    spent.current = true;

    void redeemSignInToken(token)
      .then((account) => {
        setState(
          account === null ? { kind: "refused" } : { email: account.email, kind: "signed-in" },
        );
      })
      .catch(() => {
        setState({ kind: "failed" });
      });
  }, [token]);

  const { body, title } = message(state);

  return (
    <div className="flex flex-1 flex-col justify-between px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-white/55">{body}</p>
      </div>

      <button
        type="button"
        className="w-full rounded-xl bg-white px-4 py-4 text-base font-semibold text-stone-900 disabled:opacity-35"
        disabled={state.kind === "working"}
        onClick={onDone}
      >
        Continue
      </button>
    </div>
  );
}
