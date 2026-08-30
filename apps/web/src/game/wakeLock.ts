import { useEffect } from "react";

/**
 * Keeps the screen from auto-locking while a match is on screen.
 *
 * A card game spends most of a deal being watched rather than touched — the
 * other seat's turn, a draw-phase animation — and without this the phone's
 * own auto-lock takes the screen away mid-game exactly when nobody is
 * tapping it. Supported directly in Safari since iOS 16.4, so this needs no
 * native plugin.
 *
 * The browser itself releases a wake lock the moment the tab is hidden, which
 * is the right behaviour — no reason to hold the screen open in the
 * background — but it does not reacquire one on its own when the tab comes
 * back, so this asks again on `visibilitychange` for as long as `active`
 * still holds.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) {
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = (): void => {
      // Rejects on a hidden tab, low battery, or a device that lied about
      // supporting this — none of which are worth surfacing to a player.
      void navigator.wakeLock
        .request("screen")
        .then((lock) => {
          if (cancelled) {
            void lock.release();
            return;
          }
          sentinel = lock;
        })
        .catch(() => {});
    };

    const onVisible = (): void => {
      if (document.visibilityState === "visible" && sentinel === null) {
        acquire();
      }
    };

    acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [active]);
}
