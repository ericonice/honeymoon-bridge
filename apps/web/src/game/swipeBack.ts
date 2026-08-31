import { useEffect, useRef } from "react";

/**
 * The edge-swipe gesture iOS trains everybody to reach for, on top of the
 * chevron itself — a screen that says "Back" in the corner an iPhone expects
 * but does not answer the swipe that corner promises is still only halfway
 * there.
 *
 * **Starts only within a narrow band of the left edge**, the same restraint
 * iOS's own gesture takes: anywhere wider and an ordinary vertical scroll
 * beginning near the edge would be mistaken for it. A drag that turns out to
 * be more vertical than horizontal is abandoned rather than committed, for the
 * same reason.
 *
 * Listens on `document` rather than a ref to a specific element, since every
 * screen this is used from is a full-bleed `absolute inset-0` — there is
 * nothing narrower worth scoping it to, and a ref would have to be threaded
 * through six call sites for no benefit.
 */

/** How close to the left edge a touch has to start to count as the gesture. */
const EDGE_WIDTH = 24;

/** How far it has to travel before it counts as a swipe rather than a tap. */
const COMMIT_DISTANCE = 80;

export function useSwipeBack(onBack: () => void): void {
  // A ref rather than a dependency: the listeners are attached once per mount
  // and read whatever `onBack` is current when the gesture actually completes,
  // without needing to tear down and re-attach every time the callback's
  // identity changes across renders.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let tracking = false;

    const onTouchStart = (event: TouchEvent): void => {
      const touch = event.touches[0];
      tracking = touch !== undefined && touch.clientX <= EDGE_WIDTH;
      start = tracking && touch !== undefined ? { x: touch.clientX, y: touch.clientY } : null;
    };

    const onTouchMove = (event: TouchEvent): void => {
      if (!tracking || start === null) {
        return;
      }
      const touch = event.touches[0];
      if (touch === undefined) {
        return;
      }
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      // Reads as a vertical scroll instead — give up rather than fight it.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        tracking = false;
      }
    };

    const onTouchEnd = (event: TouchEvent): void => {
      if (!tracking || start === null) {
        return;
      }
      tracking = false;
      const touch = event.changedTouches[0];
      if (touch === undefined) {
        return;
      }
      if (touch.clientX - start.x > COMMIT_DISTANCE) {
        onBackRef.current();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);
}
