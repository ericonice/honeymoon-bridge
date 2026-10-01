import { describe, expect, it } from "vitest";
import { honorsOn, netFor } from "../src/field.js";
import { scoreDuplicateDeal } from "../src/duplicate.js";
import { honorsFor } from "../src/scoring.js";
import type { Card, Contract, Pair, PlayerId, Rank, Strain, Suit } from "../src/types.js";

/**
 * Recovering honors from a score that has already been reduced to one number.
 *
 * Every case here is a **round trip**: score a real holding through
 * `scoreDuplicateDeal`, throw the hands away as the corpus does, and ask whether
 * `honorsOn` puts back what `honorsFor` took out. Asserting a literal 100 would be
 * asserting against a second copy of the scoring rule; asking the engine what it
 * paid cannot drift from what it pays.
 */

const DECLARER: PlayerId = 0;
const DEFENDER: PlayerId = 1;

function holding(suit: Suit, ranks: readonly Rank[]): readonly Card[] {
  return ranks.map((rank) => ({ rank, suit }));
}

const FOUR_HONORS = holding("H", [14, 13, 12, 11]);
const FIVE_HONORS = holding("H", [14, 13, 12, 11, 10]);
const FOUR_ACES: readonly Card[] = [
  { rank: 14, suit: "S" },
  { rank: 14, suit: "H" },
  { rank: 14, suit: "D" },
  { rank: 14, suit: "C" },
];
const NOTHING: readonly Card[] = holding("H", [5, 4, 3]);

function contractIn(strain: Strain): Contract {
  return { declarer: DECLARER, doubling: "none", level: 4, strain };
}

/** What `honorsOn` makes of a deal once the hands behind it are gone. */
function recovered(options: {
  readonly hands: Pair<readonly Card[]>;
  readonly seat: PlayerId;
  readonly strain: Strain;
  readonly tricks?: Pair<number>;
  readonly vulnerable?: Pair<boolean>;
}): number | null {
  const contract = contractIn(options.strain);
  const tricks: Pair<number> = options.tricks ?? [10, 3];
  const vulnerable: Pair<boolean> = options.vulnerable ?? [true, false];
  const scored = scoreDuplicateDeal({ contract, hands: options.hands, tricksWon: tricks }, vulnerable);
  return honorsOn({ contract, net: netFor(scored.points, options.seat), seat: options.seat, tricks, vulnerable });
}

describe("honors recovered from a recorded score", () => {
  it("puts back what the declarer was paid for four trump honors", () => {
    const paid = honorsFor(FOUR_HONORS, "H");
    expect(paid).toBeGreaterThan(0);
    expect(recovered({ hands: [FOUR_HONORS, NOTHING], seat: DECLARER, strain: "H" })).toBe(paid);
  });

  /**
   * Honors go to whoever holds them, defender included — which is the whole reason
   * a score can be surprising with nothing in the contract to account for it.
   */
  it("signs them toward the seat asked about", () => {
    const paid = honorsFor(FOUR_HONORS, "H");
    expect(recovered({ hands: [NOTHING, FOUR_HONORS], seat: DECLARER, strain: "H" })).toBe(-paid);
    expect(recovered({ hands: [NOTHING, FOUR_HONORS], seat: DEFENDER, strain: "H" })).toBe(paid);
  });

  it("tells all five apart from four", () => {
    const four = recovered({ hands: [FOUR_HONORS, NOTHING], seat: DECLARER, strain: "H" });
    const five = recovered({ hands: [FIVE_HONORS, NOTHING], seat: DECLARER, strain: "H" });
    expect(five).toBe(honorsFor(FIVE_HONORS, "H"));
    expect(five).not.toBe(four);
  });

  it("recovers four aces at no-trump", () => {
    expect(recovered({ hands: [FOUR_ACES, NOTHING], seat: DECLARER, strain: "NT" })).toBe(
      honorsFor(FOUR_ACES, "NT"),
    );
  });

  /**
   * Nothing to say and a figure it cannot explain are the same answer on screen, and
   * both have to be null rather than nought — a zero drawn beside "honors" claims
   * the deal paid some and they cancelled.
   */
  it("says nothing when no honors were paid", () => {
    expect(recovered({ hands: [NOTHING, NOTHING], seat: DECLARER, strain: "H" })).toBeNull();
  });

  /**
   * The anti-vacuity half, and the reason the check is not decoration: a net that is
   * off by anything honors could not have paid must come back null rather than being
   * reported as a strange holding.
   */
  it("refuses a residual honors could not have paid", () => {
    const contract = contractIn("H");
    const tricks: Pair<number> = [10, 3];
    const vulnerable: Pair<boolean> = [true, false];
    const scored = scoreDuplicateDeal({ contract, hands: [FOUR_HONORS, NOTHING], tricksWon: tricks }, vulnerable);
    const net = netFor(scored.points, DECLARER);

    expect(honorsOn({ contract, net, seat: DECLARER, tricks, vulnerable })).not.toBeNull();
    // One overtrick adrift, which is exactly the shape of a row this code has misread.
    expect(honorsOn({ contract, net: net + 30, seat: DECLARER, tricks, vulnerable })).toBeNull();
  });

  /**
   * Vulnerability changes the game bonus and the penalties, so a derivation that
   * scored the bare contract at the wrong one would read the whole gap as honors.
   */
  it("reads the same holding correctly at either vulnerability", () => {
    const paid = honorsFor(FOUR_HONORS, "H");
    expect(
      recovered({ hands: [FOUR_HONORS, NOTHING], seat: DECLARER, strain: "H", vulnerable: [false, false] }),
    ).toBe(paid);
    expect(
      recovered({ hands: [FOUR_HONORS, NOTHING], seat: DECLARER, strain: "H", vulnerable: [true, true] }),
    ).toBe(paid);
  });

  it("reads a contract that went down", () => {
    const paid = honorsFor(FOUR_HONORS, "H");
    expect(
      recovered({ hands: [FOUR_HONORS, NOTHING], seat: DECLARER, strain: "H", tricks: [8, 5] }),
    ).toBe(paid);
  });
});
