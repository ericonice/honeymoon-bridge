import { afterEach, describe, expect, it, vi } from "vitest";
import { whenPlayed } from "../src/ui/Record.js";

/** Local time, since that is the day somebody means when they say "today". */
function at(iso: string): number {
  return new Date(iso).getTime();
}

afterEach(() => {
  vi.useRealTimers();
});

function looking(iso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("how long ago a match was", () => {
  it("counts calendar days, not elapsed hours", () => {
    // The bug this replaces: a match at eleven last night is twelve hours old,
    // which divided by a day floors to nothing and claimed to be today. Late
    // evening is exactly when this gets played.
    looking("2026-08-08T11:31:00");
    expect(whenPlayed(at("2026-08-07T22:51:00"))).toBe("yesterday");
    expect(whenPlayed(at("2026-08-07T23:55:00"))).toBe("yesterday");
    expect(whenPlayed(at("2026-08-08T00:06:00"))).toBe("today");
    expect(whenPlayed(at("2026-08-08T09:42:00"))).toBe("today");
  });

  it("does not call something two mornings ago yesterday", () => {
    // The same fault the other way about: 30 hours is one elapsed day and two
    // calendar ones.
    looking("2026-08-08T09:00:00");
    expect(whenPlayed(at("2026-08-07T03:00:00"))).toBe("yesterday");
    expect(whenPlayed(at("2026-08-06T03:00:00"))).toBe("2 days ago");
  });

  it("holds at the edges of the day it is looked at", () => {
    looking("2026-08-08T00:01:00");
    expect(whenPlayed(at("2026-08-08T00:00:30"))).toBe("today");
    expect(whenPlayed(at("2026-08-07T23:59:30"))).toBe("yesterday");

    looking("2026-08-08T23:59:00");
    expect(whenPlayed(at("2026-08-08T00:00:30"))).toBe("today");
  });

  it("gives up on precision once it stops being the question", () => {
    looking("2026-08-08T12:00:00");
    expect(whenPlayed(at("2026-07-30T12:00:00"))).toBe("9 days ago");
    expect(whenPlayed(at("2026-07-05T12:00:00"))).toBe("a month ago");
    expect(whenPlayed(at("2026-05-08T12:00:00"))).toBe("3 months ago");
  });
});
