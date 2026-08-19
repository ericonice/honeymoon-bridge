import { describe, expect, it } from "vitest";
import { drawLessons, drawTour } from "../src/game/walkthrough.js";

const STYLES = [true, false];

describe("the tour of the draw screen", () => {
  it("points at each part of the board once, in reading order down it", () => {
    for (const open of STYLES) {
      const targets = drawTour(open).map((step) => step.target);
      expect(targets).toEqual(["opponent", "piles", "choices", "you"]);
    }
  });

  it("says something in every step, since a blank step is worse than none", () => {
    for (const open of STYLES) {
      for (const step of drawTour(open)) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.body.length).toBeGreaterThan(40);
      }
    }
  });

  /** Pointing at a face-up discard on a deal where the pile is face down is a lie. */
  it("mentions the third card only on a deal that has one", () => {
    const three = drawTour(true).map((step) => step.body).join(" ");
    const two = drawTour(false).map((step) => step.body).join(" ");

    expect(three).toContain("take it");
    expect(two).not.toContain("third choice");
  });
});

describe("the draw lessons", () => {
  /**
   * `DrawPhase` shows the lesson whose `turn` matches the turn about to be played, and
   * advances one step when it is dismissed. A gap in the numbering would leave a lesson
   * that never comes due, so the walkthrough would never reach its end.
   *
   * They start at turn 2 because the tour owns turn 1, and because each of them is
   * about something that has to have *happened* first — "what you threw is gone" means
   * nothing before anything has been thrown.
   */
  it.each(STYLES)("lands one lesson on each turn after the tour (open: %s)", (open) => {
    const turns = drawLessons(open).map((lesson) => lesson.turn);
    expect(turns).toEqual(turns.map((_, index) => index + 2));
  });

  it("fits inside the draw phase, which is thirteen turns a side", () => {
    for (const open of STYLES) {
      for (const lesson of drawLessons(open)) {
        expect(lesson.turn).toBeLessThanOrEqual(13);
      }
    }
  });

  /**
   * Under a three-card draw a discard is not gone — they may take it — so the lesson
   * that says otherwise has to be the one thing that changes with the rule.
   */
  it("does not claim a discard is gone when it is on offer", () => {
    const three = drawLessons(true).map((lesson) => lesson.body).join(" ");
    const two = drawLessons(false).map((lesson) => lesson.body).join(" ");

    expect(two).toContain("for good");
    expect(three).not.toContain("for good");
    expect(three).toContain("first refusal");
  });

  it("says something in every lesson", () => {
    for (const open of STYLES) {
      const lessons = drawLessons(open);
      expect(lessons.length).toBeGreaterThan(0);
      for (const lesson of lessons) {
        expect(lesson.title.length).toBeGreaterThan(0);
        expect(lesson.body.length).toBeGreaterThan(40);
      }
    }
  });
});
