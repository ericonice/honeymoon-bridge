// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SeatLabel } from "../src/ui/SeatLabel.js";

afterEach(() => {
  cleanup();
});

function show(over: { active?: boolean; thinking?: boolean } = {}): string {
  render(
    createElement(SeatLabel, {
      active: over.active ?? true,
      name: "Computer",
      rating: null,
      thinking: over.thinking ?? false,
      vulnerable: false,
    }),
  );
  return document.body.textContent ?? "";
}

/**
 * **The computer's longest thinks look like a hung app, and the indicator that should
 * have said otherwise could not.**
 *
 * `botActionFor` runs the solver synchronously on the main thread — sixty sampled hands
 * a card at the top rung, and the opening lead is the dearest of them, because nothing
 * has been played. Nothing repaints for the whole of it. Two consequences, and the fix
 * is one for each:
 *
 *  - a flag set immediately before the solve never reaches the screen, because the
 *    frame that would have drawn it is the frame the solve is blocking. `localSession`
 *    yields a frame between saying so and starting, which costs about 16ms of a pause
 *    it was already waiting out;
 *  - and an animation driven from JavaScript stops dead for the same reason, so the
 *    pulse froze at exactly the moment it was needed. It is a CSS animation now, which
 *    the compositor keeps running while the thread is busy.
 */
describe("saying the computer is thinking", () => {
  it("says so in words, not only as a dot", () => {
    expect(show({ thinking: true })).toContain("thinking");
  });

  /**
   * Their *turn* and their *thinking* are different states and the label draws both.
   * A turn lasting a beat and a turn where the app has stopped responding look
   * identical through a pulsing dot alone, which is why the wording earns its room.
   */
  it("says nothing extra while it is merely their turn", () => {
    expect(show({ thinking: false })).not.toContain("thinking");
  });

  /**
   * **The pulse must not be animated from JavaScript.** Anything driven from the main
   * thread stops for the whole solve — so the indicator would freeze exactly when the
   * wait is longest, and a frozen pulse reads as a hung app rather than a busy one.
   * Asserted on the class, since jsdom does no animation: what is checked is that the
   * element carries the CSS animation rather than a framer-motion style attribute.
   */
  it("pulses from CSS, so a blocked thread cannot stop it", () => {
    show({ active: true });

    const pulse = document.querySelector(".think-pulse");
    expect(pulse).not.toBeNull();
    // framer-motion writes inline styles; a compositor animation needs none.
    expect(pulse?.getAttribute("style")).toBeNull();
  });

  /**
   * **Out of the flow, because the bands it sits in are centred.** As an ordinary item
   * it widened the line, which re-centred everything already on it — so the name and
   * the rating jumped sideways the instant the computer started thinking, a worse
   * distraction than the wait being explained.
   */
  it("does not move anything when it appears", () => {
    show({ thinking: true });

    const word = [...document.querySelectorAll("span")].find(
      (one) => one.textContent?.startsWith("thinking") === true,
    );
    expect(word?.className).toContain("absolute");
  });

  it("shows no pulse at all when it is not their turn", () => {
    show({ active: false });

    expect(document.querySelector(".think-pulse")).toBeNull();
  });
});
