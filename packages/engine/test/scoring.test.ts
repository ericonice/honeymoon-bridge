import { describe, expect, it } from "vitest";
import { honorsFor, overtrickPoints, scoreDeal, undertrickPoints } from "../src/scoring.js";
import { applyDealScore, newRubber, totalScore, vulnerability } from "../src/rubber.js";
import type { Card, Contract, Level, Pair, Rank, Strain, Suit } from "../src/types.js";

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

const NO_HONORS: Pair<readonly Card[]> = [
  [card(2, "C"), card(3, "D")],
  [card(4, "H"), card(5, "S")],
];

function contract(
  level: Level,
  strain: Strain,
  doubling: Contract["doubling"] = "none",
): Contract {
  return { declarer: 0, doubling, level, strain };
}

function score(
  level: Level,
  strain: Strain,
  tricks: number,
  options: { doubling?: Contract["doubling"]; vulnerable?: boolean } = {},
) {
  const doubling = options.doubling ?? "none";
  const vulnerable = options.vulnerable ?? false;
  return scoreDeal(
    {
      contract: contract(level, strain, doubling),
      hands: NO_HONORS,
      tricksWon: [tricks, 13 - tricks],
    },
    [vulnerable, false],
  );
}

describe("trick points below the line", () => {
  it("scores minors at 20 a trick", () => {
    expect(score(3, "C", 9).belowLine[0]).toBe(60);
    expect(score(3, "D", 9).belowLine[0]).toBe(60);
  });

  it("scores majors at 30 a trick", () => {
    expect(score(4, "S", 10).belowLine[0]).toBe(120);
    expect(score(4, "H", 10).belowLine[0]).toBe(120);
  });

  it("scores no-trump at 40 for the first trick and 30 thereafter", () => {
    expect(score(1, "NT", 7).belowLine[0]).toBe(40);
    expect(score(3, "NT", 9).belowLine[0]).toBe(100);
    expect(score(7, "NT", 13).belowLine[0]).toBe(220);
  });

  it("doubles and quadruples the trick score when doubled and redoubled", () => {
    expect(score(2, "C", 8, { doubling: "doubled" }).belowLine[0]).toBe(80);
    expect(score(2, "C", 8, { doubling: "redoubled" }).belowLine[0]).toBe(160);
  });

  it("scores nothing below the line for a failed contract", () => {
    expect(score(4, "S", 9).belowLine[0]).toBe(0);
  });
});

describe("overtricks", () => {
  it("scores undoubled overtricks at the normal trick value", () => {
    expect(overtrickPoints(2, "S", "none", false)).toBe(60);
    expect(overtrickPoints(2, "C", "none", false)).toBe(40);
    expect(overtrickPoints(1, "NT", "none", false)).toBe(30);
  });

  it("scores doubled overtricks at 100 and 200", () => {
    expect(overtrickPoints(1, "C", "doubled", false)).toBe(100);
    expect(overtrickPoints(1, "C", "doubled", true)).toBe(200);
  });

  it("doubles doubled overtrick values again when redoubled", () => {
    expect(overtrickPoints(1, "C", "redoubled", false)).toBe(200);
    expect(overtrickPoints(1, "C", "redoubled", true)).toBe(400);
  });
});

describe("undertricks", () => {
  it("scores undoubled undertricks at 50 and 100", () => {
    expect(undertrickPoints(3, "none", false)).toBe(150);
    expect(undertrickPoints(3, "none", true)).toBe(300);
  });

  it("scores doubled non-vulnerable undertricks 100, 200, 200, then 300", () => {
    expect(undertrickPoints(1, "doubled", false)).toBe(100);
    expect(undertrickPoints(2, "doubled", false)).toBe(300);
    expect(undertrickPoints(3, "doubled", false)).toBe(500);
    expect(undertrickPoints(4, "doubled", false)).toBe(800);
  });

  it("scores doubled vulnerable undertricks 200 then 300 each", () => {
    expect(undertrickPoints(1, "doubled", true)).toBe(200);
    expect(undertrickPoints(3, "doubled", true)).toBe(800);
  });

  it("doubles the doubled penalties when redoubled", () => {
    expect(undertrickPoints(1, "redoubled", false)).toBe(200);
    expect(undertrickPoints(3, "redoubled", true)).toBe(1600);
  });

  it("awards the penalty to the defender", () => {
    const result = score(4, "S", 8, { doubling: "doubled" });
    expect(result.aboveLine[0]).toBe(0);
    expect(result.aboveLine[1]).toBe(300);
  });
});

describe("bonuses", () => {
  it("pays 50 for the insult on a made doubled contract and 100 redoubled", () => {
    expect(score(2, "H", 8, { doubling: "doubled" }).detail.insult).toBe(50);
    expect(score(2, "H", 8, { doubling: "redoubled" }).detail.insult).toBe(100);
  });

  it("pays no insult when the doubled contract fails", () => {
    expect(score(2, "H", 7, { doubling: "doubled" }).detail.insult).toBe(0);
  });

  it("pays small slam bonuses", () => {
    expect(score(6, "S", 12).detail.slamBonus).toBe(500);
    expect(score(6, "S", 12, { vulnerable: true }).detail.slamBonus).toBe(750);
  });

  it("pays grand slam bonuses", () => {
    expect(score(7, "S", 13).detail.slamBonus).toBe(1000);
    expect(score(7, "S", 13, { vulnerable: true }).detail.slamBonus).toBe(1500);
  });

  it("pays no slam bonus when the slam fails", () => {
    expect(score(6, "S", 11).detail.slamBonus).toBe(0);
  });
});

describe("honors", () => {
  const fourHonors = [card(14, "S"), card(13, "S"), card(12, "S"), card(11, "S")];
  const fiveHonors = [...fourHonors, card(10, "S")];
  const fourAces = [card(14, "S"), card(14, "H"), card(14, "D"), card(14, "C")];

  it("pays 100 for four trump honors in one hand", () => {
    expect(honorsFor(fourHonors, "S")).toBe(100);
  });

  it("pays 150 for all five trump honors in one hand", () => {
    expect(honorsFor(fiveHonors, "S")).toBe(150);
  });

  it("pays nothing for three trump honors", () => {
    expect(honorsFor([card(14, "S"), card(13, "S"), card(12, "S")], "S")).toBe(0);
  });

  it("ignores honors in a suit that is not trump", () => {
    expect(honorsFor(fiveHonors, "H")).toBe(0);
  });

  it("pays 150 for four aces at no-trump only", () => {
    expect(honorsFor(fourAces, "NT")).toBe(150);
    expect(honorsFor(fourHonors, "NT")).toBe(0);
  });

  it("awards honors to a defender who holds them", () => {
    const result = scoreDeal(
      {
        contract: contract(4, "S"),
        hands: [[card(2, "C")], fiveHonors],
        tricksWon: [10, 3],
      },
      [false, false],
    );
    expect(result.aboveLine[1]).toBe(150);
  });
});

describe("the line", () => {
  it("puts only the contracted tricks below it, and overtricks above", () => {
    // 2♠ making eleven tricks: 60 for the two tricks bid, 90 for the three
    // extra. A hundred and fifty points, and still only a part-score.
    const made = score(2, "S", 11);

    expect(made.belowLine[0]).toBe(60);
    expect(made.aboveLine[0]).toBe(90);

    const rubber = applyDealScore(newRubber(), made);
    expect(rubber.partScore[0]).toBe(60);
    expect(rubber.gamesWon).toEqual([0, 0]);
    expect(totalScore(rubber)[0]).toBe(150);
  });

  it("puts penalties above it, so defending never wins a game", () => {
    // Four down, doubled and vulnerable, is 1100 to the defender and leaves
    // them exactly as far from a game as they were.
    const failed = score(4, "S", 6, { doubling: "doubled", vulnerable: true });

    expect(failed.belowLine).toEqual([0, 0]);
    expect(failed.aboveLine[1]).toBe(1100);

    const rubber = applyDealScore(newRubber(), failed);
    expect(rubber.partScore).toEqual([0, 0]);
    expect(rubber.gamesWon).toEqual([0, 0]);
    expect(totalScore(rubber)[1]).toBe(1100);
  });

  it("puts slam and insult bonuses above it", () => {
    const slam = score(6, "S", 12, { doubling: "doubled" });

    // 6♠ doubled is 360 below; the slam and the insult ride above.
    expect(slam.belowLine[0]).toBe(360);
    expect(slam.aboveLine[0]).toBe(550);
  });

  it("counts both sides of the line towards the final total", () => {
    const rubber = applyDealScore(newRubber(), score(3, "NT", 10));

    // 100 below wins the game; the overtrick's 30 sits above it.
    expect(rubber.gamesWon).toEqual([1, 0]);
    expect(totalScore(rubber)[0]).toBe(130);
  });
});

describe("rubber", () => {
  it("accumulates part-scores until a game is won", () => {
    let rubber = newRubber();
    rubber = applyDealScore(rubber, score(1, "NT", 7));
    expect(rubber.partScore[0]).toBe(40);
    expect(rubber.gamesWon[0]).toBe(0);

    rubber = applyDealScore(rubber, score(2, "S", 8));
    expect(rubber.gamesWon[0]).toBe(1);
    expect(rubber.partScore).toEqual([0, 0]);
  });

  it("wipes both sides' part-scores when a game is won", () => {
    let rubber = newRubber();
    rubber = applyDealScore(rubber, {
      aboveLine: [0, 0],
      belowLine: [0, 60],
      detail: score(3, "C", 9).detail,
    });
    expect(rubber.partScore[1]).toBe(60);

    rubber = applyDealScore(rubber, score(4, "S", 10));
    expect(rubber.partScore).toEqual([0, 0]);
    expect(rubber.belowLineTotal[1]).toBe(60);
  });

  it("makes a side vulnerable once it has won a game", () => {
    let rubber = newRubber();
    expect(vulnerability(rubber)).toEqual([false, false]);

    rubber = applyDealScore(rubber, score(4, "S", 10));
    expect(vulnerability(rubber)).toEqual([true, false]);
  });

  it("pays 700 for a rubber won two games to none", () => {
    let rubber = newRubber();
    rubber = applyDealScore(rubber, score(4, "S", 10));
    rubber = applyDealScore(rubber, score(4, "S", 10));

    expect(rubber.complete).toBe(true);
    expect(rubber.winner).toBe(0);
    expect(rubber.aboveLine[0]).toBe(700);
    expect(totalScore(rubber)[0]).toBe(240 + 700);
  });

  it("pays 500 for a rubber won two games to one", () => {
    let rubber = newRubber();
    rubber = applyDealScore(rubber, score(4, "S", 10));
    rubber = applyDealScore(rubber, {
      aboveLine: [0, 0],
      belowLine: [0, 120],
      detail: score(4, "S", 10).detail,
    });
    rubber = applyDealScore(rubber, score(4, "S", 10));

    expect(rubber.complete).toBe(true);
    expect(rubber.gamesWon).toEqual([2, 1]);
    expect(rubber.aboveLine[0]).toBe(500);
  });

  it("refuses to score into a completed rubber", () => {
    let rubber = newRubber();
    rubber = applyDealScore(rubber, score(4, "S", 10));
    rubber = applyDealScore(rubber, score(4, "S", 10));
    expect(() => applyDealScore(rubber, score(4, "S", 10))).toThrow();
  });
});

describe("a one-game match", () => {
  it("ends the moment somebody first wins a game", () => {
    let match = newRubber("game");
    match = applyDealScore(match, score(1, "NT", 7));
    expect(match.complete).toBe(false);

    match = applyDealScore(match, score(2, "S", 8));
    expect(match.complete).toBe(true);
    expect(match.winner).toBe(0);
    expect(match.gamesWon).toEqual([1, 0]);
  });

  it("pays 300 rather than a rubber bonus", () => {
    // 4♠ making is 120 below the line, which is a game on its own.
    const match = applyDealScore(newRubber("game"), score(4, "S", 10));
    expect(match.aboveLine[0]).toBe(300);
    expect(totalScore(match)[0]).toBe(120 + 300);
  });

  it("never plays a deal with anyone vulnerable", () => {
    // Vulnerability is read at the start of a deal, and a deal only follows a
    // match still in progress. Winning the game ends this one, so no deal is
    // ever dealt into a vulnerable state — while the match is live, both sides
    // are always non-vulnerable.
    let match = newRubber("game");
    expect(vulnerability(match)).toEqual([false, false]);

    match = applyDealScore(match, score(1, "S", 7));
    expect(match.complete).toBe(false);
    expect(vulnerability(match)).toEqual([false, false]);

    match = applyDealScore(match, score(4, "S", 10));
    expect(match.complete).toBe(true);
  });

  it("accumulates part-scores the same way a rubber does until then", () => {
    let match = newRubber("game");
    match = applyDealScore(match, score(1, "S", 7));
    expect(match.partScore[0]).toBe(30);
    expect(match.complete).toBe(false);

    // 60 more takes it to 90 — still short of the hundred.
    match = applyDealScore(match, score(2, "S", 8));
    expect(match.partScore[0]).toBe(90);
    expect(match.complete).toBe(false);

    match = applyDealScore(match, score(1, "S", 7));
    expect(match.complete).toBe(true);
  });

  it("keeps its format across the deals of the match", () => {
    const match = applyDealScore(newRubber("game"), score(1, "S", 7));
    expect(match.format).toBe("game");
  });

  it("refuses to score into a finished one", () => {
    const match = applyDealScore(newRubber("game"), score(4, "S", 10));
    expect(() => applyDealScore(match, score(4, "S", 10))).toThrow();
  });
});
