import { useEffect, useState } from "react";
import { fetchHandLogs } from "../game/handLog.js";
import { Overlay } from "./Overlay.js";

export interface HandLogsOverlayProps {
  onClose(): void;
}

/**
 * The logged hands, raw, for a playtester looking at what a later assessment
 * pass will actually see.
 *
 * No table, no summary — a formatted dump is the whole point right now. Its
 * shape is still `bench/par.ts`'s own, and reading it as JSON is faster to
 * build and just as honest as a screen pretending to be more finished than
 * this question currently is.
 */
export function HandLogsOverlay({ onClose }: HandLogsOverlayProps): React.JSX.Element {
  const [state, setState] = useState<{ readonly hands: unknown[] } | { readonly error: true } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchHandLogs().then((hands) => {
      if (!cancelled) {
        setState(hands === null ? { error: true } : { hands });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Overlay title="Logged hands" onClose={onClose}>
      {state === null ? (
        <p className="text-sm text-white/50">Loading…</p>
      ) : "error" in state ? (
        <p className="text-sm text-white/50">Could not load logged hands.</p>
      ) : state.hands.length === 0 ? (
        <p className="text-sm text-white/50">No hands logged yet.</p>
      ) : (
        <pre className="overflow-x-auto text-[11px] leading-snug whitespace-pre-wrap text-white/70">
          {JSON.stringify(state.hands, null, 2)}
        </pre>
      )}
    </Overlay>
  );
}
