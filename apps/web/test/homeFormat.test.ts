// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { MatchFormat } from "@hb/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DESCRIPTION_LIMIT, Home } from "../src/ui/Home.js";
import type { HomeProps } from "../src/ui/Home.js";
import { MAX_SESSION_DEALS, setPreferredFormat, setQueueFormat } from "../src/game/identity.js";

afterEach(() => {
  cleanup();
});

const noop = (): void => {};

function show(
  format: MatchFormat,
  onFormatChange: HomeProps["onFormatChange"] = noop,
  onSessionDealsChange: HomeProps["onSessionDealsChange"] = noop,
): void {
  render(
    createElement(Home, {
      account: { email: "eric@example.com", name: "Eric" },
      checkingAccount: false,
      format,
      onFindOpponent: noop,
      onFormatChange,
      onJoinTable: noop,
      onPlayComputer: noop,
      onShowAccount: noop,
      onShowAchievements: noop,
      onShowHelp: noop,
      onShowRecord: noop,
      onSessionDealsChange,
      onShowSettings: noop,
      onSignIn: noop,
      sessionDeals: 10,
    }),
  );
}

/** The button whose accessible name starts with this label. */
function action(label: string): HTMLButtonElement {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) }) as HTMLButtonElement;
}

/**
 * What is being played is chosen here rather than in Settings, and these are the
 * two things that could quietly undo that.
 *
 * The first is the row disappearing back into Settings, which `settingsRows.test.ts`
 * cannot catch: its list is of rows everyone must be able to *reach*, and a format
 * row in either place satisfies it. The second is duplicate becoming reachable
 * from a table before a Durable Object can run a session — the wire carries
 * `RubberFormat` on purpose, so those two buttons have to be shut rather than
 * merely unlikely to be tapped.
 */
describe("choosing what to play, on Home", () => {
  /**
   * **Two cells, not three.** "One game" was never a third format — it is a rubber
   * that stops at the first game, which is exactly what `RubberFormat`'s two values
   * say. Sitting it beside Duplicate made the row mix categories, and how long a
   * rubber runs belongs on the line underneath where duplicate's length already is.
   */
  it("offers the two games that genuinely differ", () => {
    show("rubber");

    expect(action("Rubber")).toBeTruthy();
    expect(action("Duplicate")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "One game" })).toBeNull();
  });

  /** A single game is the rubber cell at a length of one, and the cell says so. */
  it("marks the rubber cell for a single game too", () => {
    show("game");

    expect(action("Rubber").getAttribute("aria-pressed")).toBe("true");
    expect(action("Duplicate").getAttribute("aria-pressed")).toBe("false");
  });

  it("marks the chosen one, so the row says what it is going to do", () => {
    show("duplicate");

    expect(action("Duplicate").getAttribute("aria-pressed")).toBe("true");
    expect(action("Rubber").getAttribute("aria-pressed")).toBe("false");
  });

  /**
   * A real pair of buttons with `aria-pressed`, for the reason the opponent rows
   * are real buttons with `aria-expanded`: a decorated `div` leaves the keyboard
   * and a screen reader with no way to know there is a choice here at all.
   */
  it("reports a change rather than keeping it", () => {
    const changed = vi.fn();
    show("rubber", changed);

    action("Duplicate").click();
    expect(changed).toHaveBeenCalledWith("duplicate");
  });

  it("leaves every way of starting a match open for a rubber", () => {
    show("rubber");

    expect(action("Play the computer").disabled).toBe(false);
    for (const way of ["Find", "Invite", "Join"]) {
      expect(screen.getByRole("button", { name: new RegExp(way) })).toBeTruthy();
    }
  });

  /**
   * A table can run a session now, so nothing is shut — a session is a different
   * game rather than a longer or shorter one, which is why it takes **both** seats
   * to have asked for one instead of the "shorter wins" that settles a rubber
   * against a single game; `formatFor` on the server is where that lives. Nothing
   * on this screen says so any more — the caption under the row was dropped —
   * so this is only left checking that duplicate does not disable any of them.
   */
  it("leaves the table open for a session", () => {
    show("duplicate");

    expect(action("Play the computer").disabled).toBe(false);
    for (const way of ["Find", "Invite", "Join"]) {
      expect(screen.getByRole("button", { name: new RegExp(way) })).toBeTruthy();
    }
  });

  /**
   * Said twice now — Play the computer and Invite are grouped with the picker for
   * the same reason, and a session explains itself the same way regardless of
   * who ends up on the other side of it.
   */
  it("says what a session actually is, since nobody has met one before", () => {
    show("duplicate");
    expect(screen.getAllByText(/10 deals: 5 boards, each played twice/)).toHaveLength(2);
  });
});

/**
 * The length is offered in **deals** rather than boards, because that is the
 * question being answered — how long is this game — and it is how a rubber is
 * experienced too. Every count is even: a board is worth the difference between
 * its two runs, so an odd one would leave a board played once.
 */
/**
 * The length is a **stepper on a line that is always there**, and both halves of
 * that are the point.
 *
 * A row of fixed lengths appeared only for duplicate, so choosing it inserted a row
 * above the primary button and moved "Play the computer" out from under the thumb
 * reaching for it — twice, because the first fix left a note long enough to wrap to
 * two lines, which shrank the block instead of growing it. So what is asserted is
 * not "does the control appear" but "is that space always one line doing something".
 *
 * And a stepper rather than a list because a list capped the session at whatever
 * fitted a phone's width.
 */
describe("how long a session runs", () => {
  it("is one line whatever is chosen, so nothing below it moves", () => {
    show("rubber");
    expect(screen.getByText("First to")).toBeTruthy();
    expect(screen.getByText("games")).toBeTruthy();

    cleanup();
    show("game");
    expect(screen.getByText("game")).toBeTruthy();

    cleanup();
    show("duplicate");
    expect(screen.getByText("A session of")).toBeTruthy();
  });

  /**
   * The rubber's length is a stepper now, so both formats say how long they are in
   * the same words. Its two stops are the two `RubberFormat` values, and it reports
   * them as exactly those — a single game must still be stored and rated as `"game"`,
   * since `ratings.ts` pools the formats and a match under a new name leaves the pool.
   */
  it("steps a rubber between one game and two, reporting the stored format", () => {
    const changed = vi.fn();
    show("rubber", changed);

    screen.getByRole("button", { name: "One game only" }).click();
    expect(changed).toHaveBeenCalledWith("game");

    cleanup();
    changed.mockClear();
    show("game", changed);

    screen.getByRole("button", { name: "Best of three" }).click();
    expect(changed).toHaveBeenCalledWith("rubber");
  });

  /** Short enough not to wrap, which is the whole reason the height holds. */
  /**
   * The line leans toward the option it is about, so it reads as belonging to that
   * cell rather than to the row. The row is three equal cells, so the selected one's
   * centre is at a sixth, a half or five sixths across — leaning the text that way
   * points at it without drawing anything, where actually centring under the cell
   * would wrap every line into three.
   */
  it("leans the line toward the option it is describing", () => {
    const line = (text: string): HTMLElement =>
      screen.getByText(text, { exact: false }).closest("p, div") as HTMLElement;

    show("rubber");
    expect(line("First to").className).toContain("text-left");

    cleanup();
    show("duplicate");
    expect(line("A session of").className).toContain("text-right");
  });

  it("steps by two, since an odd count would leave a board played once", () => {
    const changed = vi.fn();
    show("duplicate", noop, changed);

    screen.getByRole("button", { name: "Longer session" }).click();
    expect(changed).toHaveBeenCalledWith(12);

    changed.mockClear();
    screen.getByRole("button", { name: "Shorter session" }).click();
    expect(changed).toHaveBeenCalledWith(8);
  });

  it("shows the length it is going to play", () => {
    cleanup();
    render0("duplicate", 4);
    expect(screen.getByText("4")).toBeTruthy();
  });

  /** Two deals is one board played twice, and there is nothing shorter. */
  it("stops at two rather than stepping to nothing", () => {
    cleanup();
    render0("duplicate", 2);
    expect((screen.getByRole("button", { name: "Shorter session" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Longer session" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  /** Said twice now — see Play the computer and Invite, grouped with the picker. */
  it("says how many boards the chosen length comes to", () => {
    cleanup();
    render0("duplicate", 8);
    expect(screen.getAllByText(/8 deals: 4 boards/)).toHaveLength(2);
  });

  it("says one board rather than one boards at the shortest length", () => {
    cleanup();
    render0("duplicate", 2);
    expect(screen.getAllByText(/2 deals: 1 board, each played twice/)).toHaveLength(2);
  });
});

/** The same render, at a length other than the default. */
function render0(format: MatchFormat, deals: number): void {
  render(
    createElement(Home, {
      account: { email: "eric@example.com", name: "Eric" },
      checkingAccount: false,
      format,
      onFindOpponent: noop,
      onFormatChange: noop,
      onJoinTable: noop,
      onPlayComputer: noop,
      onSessionDealsChange: noop,
      onShowAccount: noop,
      onShowAchievements: noop,
      onShowHelp: noop,
      onShowRecord: noop,
      onShowSettings: noop,
      onSignIn: noop,
      sessionDeals: deals,
    }),
  );
}

/**
 * The block above the buttons is the same height whatever is chosen.
 *
 * Which is what stops the primary button moving out from under the thumb reaching for
 * it — a fault this control has had twice, once by a row appearing and once by a note
 * long enough to wrap. Counted rather than measured: one fixed-height line, present in
 * every format.
 *
 * The order of a session used to be a second fixed line here and is a Settings row
 * now, on Home's own test — the format changes session to session and the order does
 * not. `test/settingsRows.test.ts` is what holds it there.
 */
/**
 * **Nothing below the format row may move when the format changes**, and the row is
 * not the only thing that can move it.
 *
 * Reported after the row itself had been pinned twice: tapping between Rubber and
 * Duplicate still jumped. The culprit was two *descriptions* further down — the
 * primary button's and the line under the table row — which differ by format and were
 * different enough in length to wrap to a different number of lines on a wide enough
 * phone. The lesson is the one this control keeps teaching from a new direction: the
 * thing that moves is not the thing that changed.
 *
 * Both are pinned to two lines. These assert the strings can never need a third,
 * since they are edited far more often than the heights are, and jsdom does no layout
 * so a rendered height cannot be measured here.
 */
describe("nothing below the row moves when the format changes", () => {
  const texts = (): string[] =>
    [...document.querySelectorAll("p, span")]
      .map((one) => one.textContent ?? "")
      .filter((one) => one.startsWith("On this device") || one.startsWith("Playing a person"));

  it("keeps every format-dependent line inside two lines", () => {
    for (const format of ["rubber", "game", "duplicate"] as const) {
      cleanup();
      show(format);
      const found = texts();
      expect(found.length).toBeGreaterThan(0);
      for (const line of found) {
        expect(line.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
      }
    }
  });

  /** At the longest session, which is where the description is longest. */
  it("stays inside them at the longest session", () => {
    render0("duplicate", MAX_SESSION_DEALS);

    for (const line of texts()) {
      expect(line.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    }
  });

  it("pins both to the same height whatever is chosen", () => {
    show("rubber");
    const pinned = document.querySelectorAll(".min-h-8").length;
    expect(pinned).toBeGreaterThan(0);

    cleanup();
    show("duplicate");
    expect(document.querySelectorAll(".min-h-8").length).toBe(pinned);
  });
});

/**
 * **A trip through Duplicate used to promote a single game to a full rubber.** The
 * format is stored and perfectly sticky, but it holds only one of three values — so
 * choosing Duplicate overwrites *which* rubber was wanted, and coming back had nothing
 * to go on and defaulted to two. Reported as the length not being sticky, and it was
 * not the storage that failed but what the storage could express.
 */
describe("how long a rubber runs, remembered", () => {
  it("comes back to the length last chosen, not to a full rubber", () => {
    const changed = vi.fn();

    show("rubber", changed);
    screen.getByRole("button", { name: "One game only" }).click();
    expect(changed).toHaveBeenCalledWith("game");
    setPreferredFormat("game");

    // Off to Duplicate, which is the only thing the format key can now say.
    setPreferredFormat("duplicate");
    cleanup();
    changed.mockClear();

    show("duplicate", changed);
    action("Rubber").click();
    expect(changed).toHaveBeenCalledWith("game");
  });

  it("comes back to a full rubber when that is what was left", () => {
    setPreferredFormat("rubber");
    setPreferredFormat("duplicate");
    const changed = vi.fn();

    show("duplicate", changed);
    action("Rubber").click();

    expect(changed).toHaveBeenCalledWith("rubber");
  });
});

describe("the block above the buttons", () => {
  it("keeps one height across all three formats", () => {
    const lines = (): number => document.querySelectorAll(".h-6").length;

    show("game");
    const forGame = lines();
    cleanup();

    show("rubber");
    expect(lines()).toBe(forGame);
    cleanup();

    show("duplicate");
    expect(lines()).toBe(forGame);
  });

  it("says what the row is choosing", () => {
    show("rubber");

    expect(screen.getByText(/What you.re playing/)).toBeTruthy();
  });
});

/**
 * **"Find" says what it is currently narrowed to, since the filter is set on the
 * Searching screen rather than here.** Somebody returning to Home after choosing a
 * format there would otherwise see the same caption it always had and have no way
 * to tell "Find" no longer means anyone.
 */
describe("what Find says it is looking for", () => {
  afterEach(() => {
    setQueueFormat(null);
  });

  it("says whoever is free when nothing has been narrowed", () => {
    setQueueFormat(null);
    show("rubber");

    expect(action("Find").textContent).toContain("whoever is free");
  });

  it("names the format once the search has been narrowed to one", () => {
    setQueueFormat("duplicate");
    show("rubber");

    expect(action("Find").textContent).toContain("only duplicate");
    expect(action("Find").textContent).not.toContain("whoever is free");
  });

  /** Read once at mount, the same as every other setting on this screen. */
  it("does not change while Home stays mounted", () => {
    setQueueFormat(null);
    show("rubber");
    setQueueFormat("mirror");

    expect(action("Find").textContent).toContain("whoever is free");
  });
});
