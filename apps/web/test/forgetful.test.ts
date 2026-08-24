import { buildDeck } from "@hb/engine";
import type { Call, Card, DrawTake, PlayerView } from "@hb/engine";
import { describe, expect, test } from "vitest";
import { DIFFICULTIES, DIFFICULTY_LEVELS, levelFor } from "../src/bot/difficulty.js";
import { forgetful } from "../src/bot/forgetful.js";
import type { Bot, Standing } from "../src/bot/types.js";

/** A bot that decides nothing and records what it was told it remembered. */
function spy(): { bot: Bot; seen: Card[][] } {
  const seen: Card[][] = [];
  const remember = (remembered: readonly Card[]): void => {
    seen.push([...remembered]);
  };
  return {
    bot: {
      name: "Spy",
      chooseCall(_view: PlayerView, _standing: Standing, remembered: readonly Card[]): Call {
        remember(remembered);
        return { type: "pass" };
      },
      chooseDraw(_view: PlayerView, remembered: readonly Card[]): DrawTake {
        remember(remembered);
        return "first";
      },
      choosePlay(_view: PlayerView, remembered: readonly Card[]): Card {
        remember(remembered);
        return buildDeck()[0]!;
      },
    },
    seen,
  };
}

const view = {} as PlayerView;
const standing = {} as Standing;
const thirteen = buildDeck().slice(0, 13);

describe("a bot that forgets", () => {
  test("is told only as many cards as it remembers", () => {
    const { bot, seen } = spy();
    forgetful(bot, 5).chooseDraw(view, thirteen);
    expect(seen[0]).toHaveLength(5);
  });

  test("is told cards it really did discard, not invented ones", () => {
    const { bot, seen } = spy();
    forgetful(bot, 4).choosePlay(view, thirteen);
    const allowed = new Set(thirteen.map((card) => `${card.rank}${card.suit}`));
    for (const card of seen[0]!) {
      expect(allowed.has(`${card.rank}${card.suit}`)).toBe(true);
    }
  });

  /**
   * The property worth pinning, and the one whose absence would be a genuinely
   * confusing bug: what it has forgotten stays forgotten for the deal. A bot that
   * re-rolled per decision could rule a card out while bidding and then deal that
   * same card to the opponent two tricks later — not forgetful, incoherent.
   */
  test("forgets the same cards all deal, across every kind of decision", () => {
    const { bot, seen } = spy();
    const bounded = forgetful(bot, 6);
    bounded.chooseDraw(view, thirteen);
    bounded.chooseCall(view, standing, thirteen);
    bounded.choosePlay(view, thirteen);

    const asKeys = seen.map((cards) => cards.map((card) => `${card.rank}${card.suit}`).sort().join(","));
    expect(asKeys[0]).toBe(asKeys[1]);
    expect(asKeys[1]).toBe(asKeys[2]);
  });

  test("a different deal's discards are forgotten differently", () => {
    const { bot, seen } = spy();
    forgetful(bot, 6).chooseDraw(view, thirteen);
    forgetful(bot, 6).chooseDraw(view, buildDeck().slice(13, 26));
    expect(seen[0]).not.toEqual(seen[1]);
  });

  /** Perfect recall must cost nothing, so a pinned release stays pinned. */
  test("remembering everything returns the bot itself", () => {
    const { bot } = spy();
    expect(forgetful(bot, 13)).toBe(bot);
    expect(forgetful(bot, 99)).toBe(bot);
  });

  test("remembering nothing is allowed and is not a crash", () => {
    const { bot, seen } = spy();
    forgetful(bot, 0).chooseDraw(view, thirteen);
    expect(seen[0]).toEqual([]);
  });

  test("fewer discards than it could remember are all remembered", () => {
    const { bot, seen } = spy();
    forgetful(bot, 6).chooseDraw(view, thirteen.slice(0, 2));
    expect(seen[0]).toHaveLength(2);
  });
});

describe("the difficulty ladder", () => {
  /**
   * A ladder where one step trades one weakness for another is not a ladder. No
   * rung may be stronger than the one above it in *any* respect, or "harder" stops
   * meaning anything and the measured ratings stop being comparable.
   */
  test("every lever rises with every rung", () => {
    const rungs = DIFFICULTIES.map(levelFor);
    for (let step = 1; step < rungs.length; step++) {
      const under = rungs[step - 1]!;
      const over = rungs[step]!;
      expect(over.recall).toBeGreaterThanOrEqual(under.recall);
      expect(over.samples).toBeGreaterThanOrEqual(under.samples);
      expect(over.tuning.searchBudgetMs ?? 0).toBeGreaterThanOrEqual(under.tuning.searchBudgetMs ?? 0);
    }
  });

  /**
   * Recall is held constant across the ladder because it was measured and it is
   * worth nothing — 57.5% ± 7.5 to the forgetful side over 40 rubbers. Pinned
   * here so that varying it again is a deliberate act with a measurement behind
   * it rather than a plausible-looking edit, which is how the first ladder came
   * to be spaced on its only inert lever.
   */
  test("every rung remembers the whole deal, so none of them differs by memory", () => {
    for (const rung of DIFFICULTIES) {
      expect(levelFor(rung).recall).toBe(13);
    }
  });

  /** Perfect recall is what makes the pool exactly the cards they were offered. */
  test("every rung can therefore replay the opponent's draw", () => {
    const perfect = DIFFICULTIES.filter((one) => levelFor(one).recall >= 13);
    expect(perfect).toEqual([...DIFFICULTIES]);
  });

  /**
   * The simple bidder is the one lever that changes *what the bidder is* rather
   * than how much of it runs, so it is confined to the bottom rung on purpose —
   * every rung above it plays the release's own bidding, which is what makes
   * "which computer you play" and "how hard it plays" separable questions.
   */
  test("only the easiest rung bids by what it can make", () => {
    const simple = DIFFICULTIES.filter((one) => levelFor(one).bidding === "simple");
    expect(simple).toEqual(["kitchen"]);
  });

  /**
   * The one that would have caught the real bug: an empty tuning does not turn
   * the search off, it inherits whatever the release set. Every rung below the
   * top has to say zero out loud.
   */
  test("a rung that does not search says so, rather than leaving the key out", () => {
    for (const rung of DIFFICULTIES) {
      const budget = levelFor(rung).tuning.searchBudgetMs;
      expect(budget, `${rung} must state its search budget explicitly`).toBeTypeOf("number");
    }
  });

  test("the easiest rung does not search, so it is cheap on any phone", () => {
    expect(levelFor("kitchen").tuning.searchBudgetMs ?? 0).toBe(0);
  });

  test("every named difficulty has a rung, and every rung a name", () => {
    expect([...DIFFICULTIES].sort()).toEqual(Object.keys(DIFFICULTY_LEVELS).sort());
  });
});
