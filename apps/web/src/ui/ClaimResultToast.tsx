import { useEffect } from "react";

export type ClaimResult = "accepted" | "denied" | null;

/** How long the result stays up before it dismisses itself. */
const DISPLAY_MS = 3000;

export interface ClaimResultToastProps {
  readonly result: ClaimResult;
  onDismiss(): void;
}

/**
 * What just happened to your own claim, said plainly.
 *
 * Without this, accepting is a quiet phase change (the board just becomes the
 * score screen) and denying is a quiet reversion (the board just goes back to
 * asking you to lead or follow) — both real, both silent, and a claim is the
 * one action in the game with no other confirmation once it has been
 * answered. Scoped to the claimant only: the responder already gets a clear
 * answer from tapping Accept or Deny themselves.
 */
export function ClaimResultToast({ onDismiss, result }: ClaimResultToastProps): React.JSX.Element | null {
  useEffect(() => {
    if (result === null) {
      return;
    }
    const timer = setTimeout(onDismiss, DISPLAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [onDismiss, result]);

  if (result === null) {
    return null;
  }

  return (
    <div className="safe-inset absolute inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
      <div
        className={`rounded-xl px-4 py-3 text-center text-sm font-semibold shadow-lg ring-1 ${
          result === "accepted"
            ? "bg-emerald-950/90 text-emerald-100 ring-emerald-400/30"
            : "bg-table-dark/95 text-amber-100 ring-amber-300/30"
        }`}
      >
        {result === "accepted" ? "Claim accepted — the rest is yours" : "Claim denied — keep playing"}
      </div>
    </div>
  );
}
