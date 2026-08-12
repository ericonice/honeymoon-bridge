import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * The last line of defense against a blank screen.
 *
 * Nothing else in the app renders a fallback for a thrown error, and the
 * frame underneath every screen — `body`, `.table-surface` — is itself a
 * near-solid navy blue. Without this, a render error anywhere below `App`
 * unmounts the whole tree and leaves exactly that color on screen with
 * nothing on it: indistinguishable from a game that is merely still loading,
 * and reported as "the screen turns blue" rather than as a crash.
 *
 * A reload is the only recovery offered because it is the only one that is
 * actually true here — there is no partial state this boundary could hand
 * back that would be safer to keep rendering than to throw away.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled error, tree unmounted:", error, info.componentStack);
  }

  public override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    return (
      <div
        className="table-surface relative mx-auto flex h-[100dvh] w-full max-w-md flex-col items-center justify-center gap-5 px-6 text-center text-white"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
        }}
      >
        <div>
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-1 text-sm text-white/55">
            Reloading picks up where this left off — nothing about a match in progress lives only
            on this screen.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl bg-white px-6 py-3 text-base font-semibold text-stone-900"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
