// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sound coming back after something else took the audio.
 *
 * **WebKit has a fourth `AudioContext` state the spec does not name**:
 * `"interrupted"`, which is where a call, Siri, an alarm or the phone locking puts
 * it. A check for `"suspended"` never matched it, so the context was never resumed
 * and every sound afterwards did nothing — reported as the sound simply stopping,
 * with nothing to do but restart the app.
 *
 * Driven through the gesture listener rather than by playing anything, because that
 * listener is the only place WebKit will honor a resume at all.
 */

class FakeContext {
  static made: FakeContext[] = [];
  resumed = 0;
  state = "suspended";

  constructor() {
    FakeContext.made.push(this);
  }

  resume(): Promise<void> {
    this.resumed += 1;
    this.state = "running";
    return Promise.resolve();
  }
}

/** The context the module is currently holding, which is the last one it made. */
function current(): FakeContext {
  return FakeContext.made[FakeContext.made.length - 1]!;
}

function tap(): void {
  document.dispatchEvent(new Event("pointerdown"));
}

beforeEach(async () => {
  FakeContext.made = [];
  vi.resetModules();
  globalThis.AudioContext = FakeContext as unknown as typeof AudioContext;
  // Importing is what registers the listeners, so it has to follow the stub.
  await import("../src/game/soundEffects.js");
});

afterEach(() => {
  vi.resetModules();
});

describe("keeping the sound alive", () => {
  it("makes and resumes a context on the first gesture", () => {
    expect(FakeContext.made).toHaveLength(0);

    tap();

    expect(FakeContext.made).toHaveLength(1);
    expect(current().state).toBe("running");
  });

  /**
   * The bug. `"interrupted"` is not `"suspended"`, so a check for the latter left
   * this context stopped for the rest of the session.
   */
  it("revives a context that something else interrupted", () => {
    tap();
    current().state = "interrupted";

    tap();

    expect(current().resumed).toBe(2);
    expect(current().state).toBe("running");
  });

  /**
   * The anti-vacuity half: a listener that resumed on every tap regardless would
   * pass the test above while saying nothing about noticing the state.
   */
  it("leaves a running context alone", () => {
    tap();
    expect(current().resumed).toBe(1);

    tap();
    tap();

    expect(current().resumed).toBe(1);
  });

  /**
   * And a closed one cannot be resumed at all — `resume` throws on it — so it is
   * replaced. iOS closes the context of a page it has evicted.
   */
  it("replaces a context that was closed rather than resuming it", () => {
    tap();
    current().state = "closed";

    tap();

    expect(FakeContext.made).toHaveLength(2);
    expect(current().state).toBe("running");
  });

  /** Coming back to the app is the other moment it can be found stopped. */
  it("revives on the app becoming visible again", () => {
    tap();
    current().state = "interrupted";

    document.dispatchEvent(new Event("visibilitychange"));

    expect(current().state).toBe("running");
  });
});
