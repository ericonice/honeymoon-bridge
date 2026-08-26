import { describe, expect, it } from "vitest";
import { drawLessons, drawTour } from "../src/game/walkthrough.js";

describe("the tour of the draw screen", () => {
  it("points at each part of the board once, in reading order down it", () => {
    expect(drawTour().map((step) => step.target)).toEqual([
      "opponent",
      "piles",
      "choices",
      "you",
    ]);
  });

  it("says something in every step, since a blank step is worse than none", () => {
    for (const step of drawTour()) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(40);
    }
  });

  /**
   * What a step may describe is decided by what its cutout frames, and the
   * `opponent` step anchors on their row of card backs alone — so their turn track
   * is outside the highlight and the tour must not narrate it. The dot colours are
   * named on the `you` step, which does take in the track below the hand.
   */
  it("names the dot colours on the step whose cutout includes them", () => {
    const step = drawTour().find((one) => one.target === "you")!;
    expect(step.body).toContain("blue");
    expect(step.body).toContain("purple");
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
  it("lands one lesson on each turn after the tour", () => {
    const turns = drawLessons().map((lesson) => lesson.turn);
    expect(turns).toEqual(turns.map((_, index) => index + 2));
  });

  it("fits inside the draw phase, which is thirteen turns a side", () => {
    for (const lesson of drawLessons()) {
      expect(lesson.turn).toBeLessThanOrEqual(13);
    }
  });

  /**
   * The one rule of this game a person cannot see on the screen: a discard is gone,
   * there is no pile to look back through, and nothing will remind you. It is the
   * reason the lessons exist at all, so a version that stopped saying it would be a
   * walkthrough that taught the parts and not the point.
   */
  it("says a discard is gone for good", () => {
    expect(drawLessons().map((lesson) => lesson.body).join(" ")).toContain("for good");
  });

  it("says something in every lesson", () => {
    const lessons = drawLessons();
    expect(lessons.length).toBeGreaterThan(0);
    for (const lesson of lessons) {
      expect(lesson.title.length).toBeGreaterThan(0);
      expect(lesson.body.length).toBeGreaterThan(40);
    }
  });
});
