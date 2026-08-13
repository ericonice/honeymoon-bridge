import type { Unlock } from "@hb/engine";
import { useEffect } from "react";
import { ACHIEVEMENTS, tierLabel } from "../game/labels.js";
import { AchievementIcon } from "./icons.js";

/** How long an unlock stays up before it dismisses itself. */
const DISPLAY_MS = 4000;

export interface AchievementToastProps {
  readonly unlocked: readonly Unlock[];
  onDismiss(): void;
}

/**
 * What just unlocked, named on top of the game rather than saved for later.
 *
 * The robot game has no server in the loop while it is being played, so this
 * is shown from the same local guess `useAchievementTracker` already made —
 * see its own doc comment for the one thing that means: it can name something
 * that, if the report right after it never reaches the server, will not
 * actually have persisted. Accepted rather than solved, because waiting on
 * that round trip would mean no notification at all while offline, which is
 * most of the point of playing against the computer.
 */
export function AchievementToast({
  onDismiss,
  unlocked,
}: AchievementToastProps): React.JSX.Element | null {
  useEffect(() => {
    if (unlocked.length === 0) {
      return;
    }
    const timer = setTimeout(onDismiss, DISPLAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [onDismiss, unlocked]);

  if (unlocked.length === 0) {
    return null;
  }

  return (
    <div className="safe-inset absolute inset-x-0 top-0 z-50 flex flex-col gap-2 px-4 pt-3">
      {unlocked.map((unlock) => (
        <button
          key={`${unlock.achievement}:${unlock.tier}`}
          type="button"
          className="flex items-center gap-3 rounded-xl bg-table-dark/95 px-4 py-3 text-left shadow-lg ring-1 ring-white/15"
          onClick={onDismiss}
        >
          <AchievementIcon className="h-7 w-7 shrink-0 text-amber-200" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">
              {ACHIEVEMENTS[unlock.achievement].tiers[unlock.tier]}
            </span>
            <span className="block text-[11px] tracking-wide text-white/45 uppercase">
              {tierLabel(unlock.tier)} &middot; {ACHIEVEMENTS[unlock.achievement].name}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
