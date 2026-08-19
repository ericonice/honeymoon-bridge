import { describe, expect, it } from "vitest";
import { applyAction, cardId, createRng, startDeal, viewFor } from "@hb/engine";
import type { Card, DealState, PlayerId, Rank, Suit } from "@hb/engine";
import { chooseTake } from "../src/bot/drawDecision.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";
import { createSamplingBot } from "../src/bot/samplingBot.js";

function hand(spec: string): Card[] {
  const ranks: Record<string, Rank> = {
    A: 14, K: 13, Q: 12, J: 11, T: 10,
    "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
  };
  return spec.split(" ").flatMap((group) => {
    const [suit, cards] = group.split(":") as [Suit, string];
    return [...cards].map((rank) => ({ rank: ranks[rank]!, suit }));
  });
}

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });

describe("choosing among three cards in the draw", () => {
  it("takes a visible ace off the pile over a low card and an unknown one", () => {
    const take = chooseTake({
      discardTop: card(14, "S"),
      first: card(3, "D"),
      hand: hand("S:K94 H:872"),
      remembered: [],
    });
    expect(take).toBe("discard");
  });

  it("keeps its own card when the pile holds something worse", () => {
    const take = chooseTake({
      discardTop: card(2, "D"),
      first: card(14, "S"),
      hand: hand("S:K94 H:872"),
      remembered: [],
    });
    expect(take).toBe("first");
  });

  /**
   * The pile is adversely selected — half of what lands on it is a card the other
   * player judged worse than an unknown one — so a policy that always took the
   * visible card would be walking into that every turn.
   */
  it("prefers an unknown card to a visible one that does nothing for the hand", () => {
    const take = chooseTake({
      discardTop: card(2, "D"),
      first: card(3, "D"),
      hand: hand("S:AKQ H:AKQ"),
      remembered: [],
    });
    expect(take).toBe("second");
  });

  /**
   * The failure `DEFENSE_SHARE` exists for. Valued purely as declarer in its best
   * strain, a low card added to an already-long suit scores about 1.33 — a winner
   * plus one fewer trump left in the other hand — against an ace's flat 1.00, so
   * the bot passed up visible aces for filler. Every one of these hands is long in
   * a suit and holds no ace.
   */
  it.each([
    ["S:84JQ3 D:6K4 C:6T4", card(5, "S"), card(14, "H")],
    ["S:3AQ4 D:J9 H:36 C:34", card(6, "S"), card(14, "C")],
    ["S:837Q9 D:T H:4Q C:2Q", card(4, "S"), card(14, "D")],
    ["D:A4926JK H:985 S:T5", card(3, "D"), card(14, "S")],
  ])("takes a visible ace over filler in a long suit (%s)", (spec, first, ace) => {
    expect(chooseTake({ discardTop: ace, first, hand: hand(spec), remembered: [] })).toBe("discard");
  });

  /**
   * The way the fix above could have gone wrong: promoting every honor over every
   * long card would make a draw that never builds a suit. A king beside the ace is
   * worth more than a bare ace somewhere else, and still wins.
   */
  it("keeps an honor that fills out a holding it already has", () => {
    const take = chooseTake({
      discardTop: card(14, "S"),
      first: card(13, "H"),
      hand: hand("H:A84 C:58"),
      remembered: [],
    });
    expect(take).toBe("first");
  });

  it("decides exactly as the base game does when there is nothing on offer", () => {
    const options = { first: card(14, "S"), hand: hand("S:K94 H:872"), remembered: [] };
    expect(chooseTake({ ...options, discardTop: null })).toBe("first");
    expect(chooseTake({ ...options, discardTop: null, first: card(2, "D") })).toBe("second");
  });

  it("never offers a card lying on the pile as the unknown card as well", () => {
    // The queen is on the pile, so it cannot also turn up as card 2 — and if the
    // pool contained it, an unknown card would be valued as though it might.
    const queen = card(12, "S");
    const withTop = chooseTake({
      discardTop: queen,
      first: card(2, "C"),
      hand: hand("S:AK432 H:65"),
      remembered: [],
    });
    expect(withTop).toBe("discard");
  });
});

describe("the computer playing the open discard", () => {
  /** Both seats driven by the shipped bot, under the variant, for a whole draw. */
  function drawOut(seed: number): DealState {
    const bot = createSamplingBot(createRng(seed), 4);
    let state = startDeal({ rules: { openDiscard: true }, seed, starter: 0 });
    while (state.phase === "draw") {
      const seat: PlayerId = state.toAct;
      state = applyAction(state, seat, botActionFor({ bot, seat, standing: loveAll(), state }));
    }
    return state;
  }

  it("draws a legal hand of thirteen every deal", () => {
    for (let seed = 900; seed < 912; seed++) {
      const finished = drawOut(seed);
      expect(finished.phase).toBe("auction");
      expect(finished.hands[0]).toHaveLength(13);
      expect(finished.hands[1]).toHaveLength(13);

      const everything = [
        ...finished.hands[0],
        ...finished.hands[1],
        ...finished.discards[0],
        ...finished.discards[1],
      ];
      expect(new Set(everything.map(cardId)).size).toBe(52);
    }
  });

  /**
   * A rule the computer never uses is a rule only one side of the table is
   * playing under, which would make every measurement of the variant a
   * measurement of a handicap instead.
   */
  it("actually takes the offered card sometimes", () => {
    let taken = 0;
    for (let seed = 900; seed < 912; seed++) {
      taken += drawOut(seed).drawTurns.filter((turn) => turn.choice === "took-discard").length;
    }
    expect(taken).toBeGreaterThan(0);
  });

  it("is never handed the choice when the pile is empty", () => {
    const state = startDeal({ rules: { openDiscard: true }, seed: 950, starter: 0 });
    const bot = createSamplingBot(createRng(950), 4);

    expect(viewFor(state, 0).discardTop).toBeNull();
    expect(bot.chooseDraw(viewFor(state, 0), [])).not.toBe("discard");
  });
});
