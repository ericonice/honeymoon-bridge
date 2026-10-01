// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useSwipeBack } from "../src/game/swipeBack.js";

/**
 * The edge swipe, and which screen answers it.
 *
 * It listens on `document`, so **every** mounted caller hears the same gesture —
 * which was already wrong before anything deliberately stacked: `HelpOverlay` calls
 * it and then returns `ScoringOverlay`, which calls it too, and hooks do not care
 * what a component returned. Swiping back from Scoring went back past Help as well,
 * two screens for one gesture.
 */

function swipe(from = 6): void {
  fireEvent.touchStart(document, { touches: [{ clientX: from, clientY: 300 }] });
  fireEvent.touchMove(document, { touches: [{ clientX: from + 120, clientY: 305 }] });
  fireEvent.touchEnd(document, { changedTouches: [{ clientX: from + 120, clientY: 305 }] });
}

function Screen({ onBack }: { onBack(): void }): React.JSX.Element {
  useSwipeBack(onBack);
  return createElement("div");
}

/** An outer screen that keeps its own gesture registered while showing an inner one. */
function Stack({
  onInner,
  onOuter,
}: {
  onInner(): void;
  onOuter(): void;
}): React.JSX.Element {
  useSwipeBack(onOuter);
  const [inner] = useState(true);
  return inner ? createElement(Screen, { onBack: onInner }) : createElement("div");
}

afterEach(cleanup);

describe("the edge swipe", () => {
  it("goes back on a drag from the edge", () => {
    let backs = 0;
    render(createElement(Screen, { onBack: () => { backs += 1; } }));
    swipe();

    expect(backs).toBe(1);
  });

  it("ignores a drag that did not start at the edge", () => {
    let backs = 0;
    render(createElement(Screen, { onBack: () => { backs += 1; } }));
    swipe(200);

    expect(backs).toBe(0);
  });

  /**
   * One gesture, one screen. The outer one is still mounted and still listening —
   * that is the situation, not a thing to fix by unmounting it.
   */
  it("is answered by the screen on top and by nothing under it", () => {
    let inner = 0;
    let outer = 0;
    render(
      createElement(Stack, {
        onInner: () => { inner += 1; },
        onOuter: () => { outer += 1; },
      }),
    );
    swipe();

    expect(inner).toBe(1);
    expect(outer).toBe(0);
  });

  /**
   * The anti-vacuity half: with the inner screen gone the outer one answers again,
   * so "the top one" is being chosen rather than the outer one simply never firing.
   */
  it("hands the gesture back when the screen on top goes", () => {
    let outer = 0;
    const { rerender } = render(
      createElement(Stack, { onInner: () => {}, onOuter: () => { outer += 1; } }),
    );
    swipe();
    expect(outer).toBe(0);

    rerender(createElement(Screen, { onBack: () => { outer += 1; } }));
    swipe();
    expect(outer).toBe(1);
  });
});
