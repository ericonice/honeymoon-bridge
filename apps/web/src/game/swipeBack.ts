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
 *
 * **Only the topmost screen answers**, which listening on `document` makes
 * necessary rather than optional: every mounted caller hears the same gesture,
 * so without this a swipe fires all of them at once. It was already wrong
 * before any screen deliberately stacked — `HelpOverlay` calls this and *then*
 * returns `ScoringOverlay`, which calls it too, and hooks do not care what a
 * component returned. Swiping back from Scoring therefore went back past Help
 * as well, landing two screens away from where one gesture should have gone.
 *
 * **Topmost is decided by first render, not by mounting**, and the difference
 * is not academic: React runs effects child-first, so a page that opens
 * straight into a sub-page registers the *inner* one first and would hand the
 * gesture to the outer. Render order is the other way round — a parent renders
 * before its child, and a page opened later renders later — so a token taken
 * on the first render puts the innermost, newest screen highest in both cases.
 *
 * It is not a general truth about z-order. A screen floating above an older one
 * without being rendered by or after it would need something better than this,
 * and nothing in the app does that.
 */

/** Increasing with every screen that ever registers, so the newest is the largest. */
let nextDepth = 0;

/** Every mounted screen, by the depth it took on its first render. */
const mounted = new Map<React.RefObject<() => void>, number>();

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

  // Taken during render rather than in the effect below — see the doc above for
  // why the two orders differ and why this one is the right one.
  const depth = useRef(0);
  if (depth.current === 0) {
    nextDepth += 1;
    depth.current = nextDepth;
  }

  useEffect(() => {
    const mine = onBackRef;
    mounted.set(mine, depth.current);
    return () => {
      mounted.delete(mine);
    };
  }, []);

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
      if (touch.clientX - start.x <= COMMIT_DISTANCE) {
        return;
      }
      // Every mounted screen hears this, and only the one on top may answer.
      let top = 0;
      for (const at of mounted.values()) {
        top = Math.max(top, at);
      }
      if (depth.current === top) {
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
