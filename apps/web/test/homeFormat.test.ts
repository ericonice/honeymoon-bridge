// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { MatchFormat } from "@hb/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Home } from "../src/ui/Home.js";
import type { HomeProps } from "../src/ui/Home.js";

afterEach(() => {
  cleanup();
});

const noop = (): void => {};

function show(
  format: MatchFormat,
  onFormatChange: HomeProps["onFormatChange"] = noop,
  onSessionDealsChange: HomeProps["onSessionDealsChange"] = noop,
  onSessionOrderChange: HomeProps["onSessionOrderChange"] = noop,
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
      onSessionOrderChange,
      onShowSettings: noop,
      onSignIn: noop,
      sessionDeals: 10,
      sessionOrder: "halves",
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
  it("offers all three formats", () => {
    show("rubber");

    expect(action("One game")).toBeTruthy();
    expect(action("Rubber")).toBeTruthy();
    expect(action("Duplicate")).toBeTruthy();
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
    expect(action("Find an opponent").disabled).toBe(false);
    expect(action("Start a table").disabled).toBe(false);
  });

  /**
   * A table can run a session now, so nothing is shut — but it takes **both** seats
   * to have asked for one, and the buttons say so rather than letting somebody
   * discover it when the table deals a rubber. A session is a different game rather
   * than a longer or shorter one, which is why the rule is "both" instead of the
   * "shorter wins" that settles a rubber against a single game; `formatFor` on the
   * server is where that lives.
   */
  it("leaves the table open for a session, and says it takes both", () => {
    show("duplicate");

    expect(action("Play the computer").disabled).toBe(false);
    expect(action("Find an opponent").disabled).toBe(false);
    expect(action("Start a table").disabled).toBe(false);
    expect(screen.getAllByText(/needs you both to want one/).length).toBe(2);
  });

  it("says what a session actually is, since nobody has met one before", () => {
    show("duplicate");
    expect(screen.getByText(/10 deals: 5 boards, each played twice/)).toBeTruthy();
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
    expect(screen.getByText("Best of three games")).toBeTruthy();

    cleanup();
    show("game");
    expect(screen.getByText("First to 100 below the line")).toBeTruthy();

    cleanup();
    show("duplicate");
    expect(screen.getByText("A session of")).toBeTruthy();
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

    show("game");
    expect(line("First to 100").className).toContain("text-left");

    cleanup();
    show("rubber");
    expect(line("Best of three").className).toContain("text-center");

    cleanup();
    show("duplicate");
    expect(line("A session of").className).toContain("text-right");
  });

  it("keeps every version of that line short", () => {
    for (const note of ["Best of three games", "First to 100 below the line"]) {
      expect(note.length).toBeLessThan(32);
    }
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

  it("says how many boards the chosen length comes to", () => {
    cleanup();
    render0("duplicate", 8);
    expect(screen.getByText(/8 deals: 4 boards/)).toBeTruthy();
  });

  it("says one board rather than one boards at the shortest length", () => {
    cleanup();
    render0("duplicate", 2);
    expect(screen.getByText(/2 deals: 1 board, each played twice/)).toBeTruthy();
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
      onSessionOrderChange: noop,
      onShowAccount: noop,
      onShowAchievements: noop,
      onShowHelp: noop,
      onShowRecord: noop,
      onShowSettings: noop,
      onSignIn: noop,
      sessionDeals: deals,
      sessionOrder: "halves",
    }),
  );
}

/**
 * How a session orders its deals: back to back, halves, or shuffled.
 *
 * A setting rather than a decision because the three are different *games* rather
 * than three arrangements of one — back to back makes the comparison immediate,
 * shuffled makes recognising the board part of it — and which is better is not
 * something a bench has an opinion about.
 *
 * The row lives on a **second fixed line** under the format row, empty for the two
 * rubber formats. The emptiness is the point: it keeps the block one height, which is
 * the fault this control has already had twice, and the space it leaves is the
 * separation between choosing what to play and the buttons that act on the choice.
 */
describe("how a session orders its deals", () => {
  it("offers the three orders, and only for a session", () => {
    show("rubber");
    expect(screen.queryByText("Order")).toBeNull();

    cleanup();
    show("duplicate");
    expect(screen.getByText("Order")).toBeTruthy();
    for (const label of ["Back to back", "Halves", "Shuffled"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("marks the chosen order and reports a change", () => {
    const changed = vi.fn();
    show("duplicate", noop, noop, changed);

    expect(screen.getByRole("button", { name: "Halves" }).getAttribute("aria-pressed")).toBe("true");
    screen.getByRole("button", { name: "Back to back" }).click();
    expect(changed).toHaveBeenCalledWith("adjacent");
  });

  /**
   * The block is the same height whatever is chosen, which is what stops the primary
   * button moving. Counted rather than measured: two lines of fixed height plus the
   * row, present in every format.
   */
  it("keeps the block one height across all three formats", () => {
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
});
