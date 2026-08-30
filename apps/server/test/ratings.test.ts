import { describe, expect, it, test } from "vitest";
import { DIFFICULTIES, levelFor } from "../../web/src/bot/difficulty.js";
import type { Env } from "../src/env.js";
import {
  botAnchors,
  botRating,
  expectedScore,
  HISTORY_LENGTH,
  K_FACTOR,
  PROVISIONAL_K_FACTOR,
  PROVISIONAL_MATCHES,
  stepFor,
  ratingOf,
  ratingsFor,
  START_RATING,
} from "../src/ratings.js";
import { ROBOT_TOKEN } from "../src/results.js";

interface Row {
  readonly account0: string | null;
  readonly account1: string | null;
  readonly bot_version: number | null;
  readonly deals?: number;
  readonly difficulty?: string;
  readonly format?: string;
  readonly token0: string;
  readonly token1: string;
  readonly winner: number;
}

/** `ratingsFor` makes one query with no bindings, so this is all the DB it needs. */
function env(rows: readonly Row[]): Env {
  return {
    DB: {
      prepare: () => ({ all: () => Promise.resolve({ results: rows }) }),
    },
  } as unknown as Env;
}

/** A match against the computer, from the person's side as seat 0. */
function vsBot(
  winner: 0 | 1,
  version: number | null = 2,
  account = "ada",
  over: Partial<Row> = {},
): Row {
  return {
    account0: account,
    account1: null,
    bot_version: version,
    token0: `device-${account}`,
    token1: ROBOT_TOKEN,
    winner,
    ...over,
  };
}

function vsPerson(winner: 0 | 1): Row {
  return {
    account0: "ada",
    account1: "noah",
    bot_version: null,
    token0: "device-ada",
    token1: "device-noah",
    winner,
  };
}

const of = async (rows: readonly Row[], id = "account:ada"): Promise<number> =>
  (await ratingsFor(env(rows))).rating.get(id) ?? START_RATING;

describe("expectedScore", () => {
  it("is even money at the same rating", () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
  });

  /** The gaps everybody quotes, and the ones the bot anchors were chosen against. */
  it("matches the standard table", () => {
    expect(expectedScore(1600, 1500)).toBeCloseTo(0.64, 2);
    expect(expectedScore(1700, 1500)).toBeCloseTo(0.76, 2);
    expect(expectedScore(1900, 1500)).toBeCloseTo(0.909, 2);
    // 87% — the gap this account's 26–4 against the computer implies.
    expect(expectedScore(1830, 1500)).toBeCloseTo(0.87, 2);
  });

  it("is two halves of the same match", () => {
    expect(expectedScore(1720, 1480) + expectedScore(1480, 1720)).toBeCloseTo(1, 10);
  });
});

describe("botRating", () => {
  it("puts the current version above the first", () => {
    expect(botRating(2)).toBeGreaterThan(botRating(1));
  });

  /** Null means "played before versions existed", not "unknown" — see `0006_bot_version.sql`. */
  it("rates an unversioned robot game as the first bot", () => {
    expect(botRating(null)).toBe(botRating(1));
  });

  it("does not invent a rating for a version it has never heard of", () => {
    expect(botRating(97)).toBe(botRating(null));
  });
});

describe("ratingsFor", () => {
  it("starts a player at the nominal average", async () => {
    expect(await of([])).toBe(START_RATING);
  });

  /**
   * The whole reason this is worth having. Elo conserves points, so a pool of two
   * people just passes the same points back and forth and says nothing their
   * head-to-head record did not. A pinned opponent is an anchor: beating it moves
   * you and never moves it.
   */
  it("never moves the computer, whoever it plays", async () => {
    const rows = [vsBot(0), vsBot(0), vsBot(1, 2, "noah")];
    const ratings = await ratingsFor(env(rows));

    expect([...ratings.rating.keys()]).toEqual(["account:ada", "account:noah"]);
    expect(ratings.rating.has(`token:${ROBOT_TOKEN}`)).toBe(false);
  });

  it("moves a first result by the provisional K, not the settled one", async () => {
    // Even money against an equal opponent: a win is exactly half a step, and a
    // first match is still settling, so the step is the larger one.
    const drawnLevel = await of([vsPerson(0)]);
    expect(drawnLevel).toBeCloseTo(START_RATING + PROVISIONAL_K_FACTOR * 0.5, 6);
  });

  /**
   * The point of the provisional period: everybody starts a hundred points above
   * the strongest bot, and at the settled K that prior takes tens of games to
   * wash out. Asserted as a *comparison* rather than against a number, so the
   * constants can be retuned without rewriting the claim they exist to make.
   */
  it("sheds the starting prior faster while a rating is settling", async () => {
    const losses = Array.from({ length: 6 }, () => vsBot(1));
    const settling = await of(losses);

    // The same six losses, but arriving after the settling period is over.
    const seasoned = await of([...Array.from({ length: 10 }, () => vsBot(0)), ...losses]);
    const afterTen = await of(Array.from({ length: 10 }, () => vsBot(0)));

    expect(START_RATING - settling).toBeGreaterThan(afterTen - seasoned);
  });

  it("returns to the settled K once the settling period is over", async () => {
    const played = Array.from({ length: PROVISIONAL_MATCHES }, () => vsPerson(0));
    const before = await of(played);
    const after = await of([...played, vsPerson(0)]);
    // Beating an opponent this far below you is nearly a certainty, so the step
    // is small — but it must be a `K_FACTOR` step rather than a provisional one.
    expect(after - before).toBeLessThan(K_FACTOR);
    expect(stepFor(PROVISIONAL_MATCHES)).toBe(K_FACTOR);
    expect(stepFor(PROVISIONAL_MATCHES - 1)).toBe(PROVISIONAL_K_FACTOR);
  });

  it("pays more for beating somebody better than you", async () => {
    // The first bot is 500 below; the second only 300. Beating the nearer one is
    // the bigger result and has to be worth more.
    const easy = (await of([vsBot(0, 1)])) - START_RATING;
    const harder = (await of([vsBot(0, 2)])) - START_RATING;
    expect(harder).toBeGreaterThan(easy);
  });

  it("conserves points between two people", async () => {
    const ratings = await ratingsFor(env([vsPerson(0), vsPerson(1), vsPerson(0)]));
    const total =
      (ratings.rating.get("account:ada") ?? 0) + (ratings.rating.get("account:noah") ?? 0);
    expect(total).toBeCloseTo(START_RATING * 2, 6);
  });

  /**
   * Elo is sequential — each result is priced against the ratings *at the time* — so
   * the same matches in a different order give a different answer. This is why the
   * robot route records when a rubber ended rather than when its report arrived: a
   * queued result delivered days late would otherwise sort after games played since.
   */
  it("depends on the order the matches were played", async () => {
    const early = [vsBot(0, 2), vsBot(0, 2), vsBot(1, 2)];
    const late = [vsBot(1, 2), vsBot(0, 2), vsBot(0, 2)];
    expect(await of(early)).not.toBeCloseTo(await of(late), 6);
  });

  it("climbs toward the gap its win rate implies", async () => {
    // 21–2 against the 1200 bot is about 91%, which is a gap near 400.
    const rows = [
      ...Array.from({ length: 21 }, () => vsBot(0, 2)),
      vsBot(1, 2),
      vsBot(1, 2),
    ];
    const rating = await of(rows);
    expect(rating).toBeGreaterThan(START_RATING);
    expect(rating).toBeLessThan(botRating(2) + 400);
  });

  it("counts a match for each side and none for the computer", async () => {
    const ratings = await ratingsFor(env([vsPerson(0), vsBot(0)]));
    expect(ratings.played.get("account:ada")).toBe(2);
    expect(ratings.played.get("account:noah")).toBe(1);
  });
});

describe("weighing a match by its length", () => {
  it("weighs a rubber and a mirror twice as much as a single game", async () => {
    // A rung below the top one, so the mirror recall offset — a separate effect
    // from the one under test here — stays zero and does not confound it.
    const difficulty = "club";
    const gameDelta =
      (await of([vsBot(1, 2, "ada", { difficulty, format: "game" })])) - START_RATING;
    const rubberDelta =
      (await of([vsBot(1, 2, "ada", { difficulty, format: "rubber" })])) - START_RATING;
    const mirrorDelta =
      (await of([vsBot(1, 2, "ada", { difficulty, format: "mirror" })])) - START_RATING;
    expect(rubberDelta).toBeCloseTo(gameDelta * 2, 5);
    expect(mirrorDelta).toBeCloseTo(gameDelta * 2, 5);
  });

  it("scales a duplicate session by its board count, inside the clamp", async () => {
    const gameDelta = (await of([vsBot(1, 2, "ada", { format: "game" })])) - START_RATING;
    // Five boards, ten deals: 5 * 0.3 = 1.5×, comfortably inside [0.5, 3].
    const fiveBoards =
      (await of([vsBot(1, 2, "ada", { deals: 10, format: "duplicate" })])) - START_RATING;
    expect(fiveBoards).toBeCloseTo(gameDelta * 1.5, 5);
  });

  it("floors a very short duplicate session rather than letting it move almost nothing", async () => {
    const gameDelta = (await of([vsBot(1, 2, "ada", { format: "game" })])) - START_RATING;
    // One board, two deals: 1 * 0.3 = 0.3×, below the 0.5 floor.
    const oneBoard =
      (await of([vsBot(1, 2, "ada", { deals: 2, format: "duplicate" })])) - START_RATING;
    expect(oneBoard).toBeCloseTo(gameDelta * 0.5, 5);
  });

  it("caps a very long duplicate session rather than letting it dominate a rating", async () => {
    const gameDelta = (await of([vsBot(1, 2, "ada", { format: "game" })])) - START_RATING;
    // Twenty boards, forty deals: 20 * 0.3 = 6×, above the 3 ceiling.
    const twentyBoards =
      (await of([vsBot(1, 2, "ada", { deals: 40, format: "duplicate" })])) - START_RATING;
    expect(twentyBoards).toBeCloseTo(gameDelta * 3, 5);
  });
});

describe("ratingOf", () => {
  it("falls back to the average for somebody with no matches", async () => {
    const ratings = await ratingsFor(env([]));
    expect(ratingOf(ratings, "ada", [])).toEqual({
      history: [],
      played: 0,
      rating: START_RATING,
    });
  });

  /**
   * A person's games are split across their account and every device they played on
   * before signing in, so the rating has to be read from wherever the matches
   * actually landed — and from the identity holding most of them, so one anonymous
   * rubber on an old phone cannot outrank a signed-in season.
   */
  it("reads the identity the matches are actually under", async () => {
    const anonymous: Row = {
      account0: null,
      account1: null,
      bot_version: 2,
      token0: "old-phone",
      token1: ROBOT_TOKEN,
      winner: 0,
    };
    const ratings = await ratingsFor(env([anonymous, anonymous, vsBot(1)]));

    const claimed = ratingOf(ratings, "ada", ["old-phone"]);
    expect(claimed.played).toBe(2);
    expect(claimed.rating).toBeGreaterThan(START_RATING);
  });

  it("rounds, because a rating with decimals is not a thing anyone quotes", async () => {
    const ratings = await ratingsFor(env([vsBot(0)]));
    expect(Number.isInteger(ratingOf(ratings, "ada", []).rating)).toBe(true);
  });
});

describe("the rating line", () => {
  /**
   * The whole reason the history is free: the walk computes every one of these
   * points already and used to throw them away. No new query, no schema.
   */
  it("keeps one point per rated match, oldest first", async () => {
    const ratings = await ratingsFor(env([vsBot(0), vsBot(1), vsBot(0)]));
    const line = ratings.history.get("account:ada") ?? [];

    expect(line).toHaveLength(3);
    expect(line[0]!.rating).toBeGreaterThan(START_RATING);
    expect(line[1]!.rating).toBeLessThan(line[0]!.rating);
    expect(line[2]!.rating).toBeGreaterThan(line[1]!.rating);
    // The last point is the rating itself, rounded.
    expect(line[2]!.rating).toBe(ratingOf(ratings, "ada", []).rating);
  });

  /** What the chart's version tick is drawn from. A person's match carries null. */
  it("records which opponent each point was against", async () => {
    const ratings = await ratingsFor(env([vsBot(0, 1), vsBot(0, 2), vsPerson(0)]));
    const line = ratings.history.get("account:ada") ?? [];
    expect(line.map((point) => point.botVersion)).toEqual([1, 2, null]);
  });

  it("gives away nothing for the computer, which has no history to have", async () => {
    const ratings = await ratingsFor(env([vsBot(0)]));
    expect(ratings.history.has(`token:${ROBOT_TOKEN}`)).toBe(false);
  });

  it("sends only the newest points", async () => {
    const many = Array.from({ length: HISTORY_LENGTH + 15 }, () => vsBot(0));
    const ratings = await ratingsFor(env(many));
    const line = ratingOf(ratings, "ada", []).history;

    expect(line).toHaveLength(HISTORY_LENGTH);
    // The tail, not the head: a line that dropped the recent matches would be
    // drawing a shape that stopped being true.
    expect(line.at(-1)!.rating).toBe(ratingOf(ratings, "ada", []).rating);
  });
});

describe("what the computer is worth on each rung", () => {
  test("a match from before the setting existed is rated at the top rung", () => {
    // Not a default but the honest reading: those games were played with perfect
    // recall and the full sample count, because there was no way to ask for less.
    expect(botRating(3, null)).toBe(botRating(3, "championship"));
  });

  test("no rung is worth more than the hardest", () => {
    for (const rung of DIFFICULTIES) {
      expect(botRating(3, rung)).toBeLessThanOrEqual(botRating(3, "championship"));
    }
  });

  /**
   * The rung this server has never heard of is the one that matters, because it
   * happens: the client can be deployed first, and the service worker keeps old
   * builds in circulation for a long time after either. Rating it as the weakest
   * known rung means beating it earns the fewest points — the conservative
   * direction, since being told you are better than you are is the error nobody
   * notices and nothing later corrects.
   */
  test("a rung this build has never heard of is rated as the weakest one", () => {
    const weakest = Math.min(...DIFFICULTIES.map((rung) => botRating(3, rung)));
    expect(botRating(3, "grandmaster")).toBe(weakest);
  });

  test("the rung shifts a release without changing which release is stronger", () => {
    for (const rung of DIFFICULTIES) {
      expect(botRating(3, rung)).toBeGreaterThan(botRating(2, rung));
    }
  });

  /**
   * The list the client can send and the list this server prices must be the same
   * list. A rung missing here is not an error anywhere — it is silently priced as
   * the weakest, so every match played on it under-rates the player and nothing
   * says so. This is the same rule `BOT_RATINGS` states for versions, and the
   * reason it is a test rather than a comment is that the two lists live in
   * different workspaces and nothing else makes them meet.
   */
  test("every rung the app offers has a rating here", () => {
    for (const rung of DIFFICULTIES) {
      expect(botAnchors()["3"]?.[rung]).toBeTypeOf("number");
    }
  });

  test("the anchors sent to the client are the ones the rating walk uses", () => {
    const anchors = botAnchors();
    for (const version of Object.keys(anchors)) {
      for (const rung of Object.keys(anchors[version]!)) {
        expect(anchors[version]![rung]).toBe(botRating(Number(version), rung));
      }
    }
  });
});

describe("what a board's memory is worth in a two-game match", () => {
  /**
   * The computer meets the second half's boards having already played them, and a
   * person does not — measured at 56.7% ± 2.3 for the pairs alone, which is the half a
   * person cannot reproduce. It was zero until that was re-measured, on an older figure
   * that turned out to be a null taken against a bidder nobody plays.
   */
  it("rates a mirror above a rubber at the rung that remembers", () => {
    expect(botRating(3, "championship", "mirror")).toBeGreaterThan(
      botRating(3, "championship", "rubber"),
    );
  });

  /**
   * **The structural half, and the reason this is not simply a constant.** `forgetful.ts`
   * hands over no boards at all below the top rung, so a club or kitchen computer meets a
   * replayed board knowing nothing about it and has nothing to be credited for. The two
   * facts live in different workspaces, so this is the only thing that makes them meet —
   * the same reason the offsets themselves are walked against `DIFFICULTIES` above.
   */
  it("credits exactly the rungs the app gives a board's pairs to", () => {
    let remembered = 0;
    for (const rung of DIFFICULTIES) {
      const remembers = levelFor(rung).recall >= 13;
      const gap = botRating(3, rung, "mirror") - botRating(3, rung, "rubber");
      expect(gap, `${rung} remembers=${remembers}`).toBe(remembers ? gap : 0);
      if (remembers) {
        remembered += 1;
        expect(gap).toBeGreaterThan(0);
      }
    }
    expect(remembered, "no rung has perfect recall, so this asserted nothing").toBe(1);
  });

  /** Before the setting existed the bot had perfect recall, so those games get it too. */
  it("credits a match from before the difficulty setting existed", () => {
    expect(botRating(3, null, "mirror")).toBeGreaterThan(botRating(3, null, "rubber"));
    expect(botRating(3, null, "mirror")).toBe(botRating(3, "championship", "mirror"));
  });

  it("leaves every other format alone", () => {
    for (const format of ["rubber", "game", null]) {
      for (const rung of DIFFICULTIES) {
        expect(botRating(3, rung, format)).toBe(botRating(3, rung));
      }
    }
  });
});

describe("the anchors a client is handed", () => {
  /**
   * The gap this closes: the walk rated a mirror above a rubber while the table sent to
   * the client had no format in it at all, so the number beside the computer's seat
   * understated the one its own rating was computed from. `Records` says those must be
   * **one number from one place**, and for a while they were two.
   */
  it("sends a mirror table that agrees with the walk", () => {
    const mirror = botAnchors("mirror");
    for (const [version, rungs] of Object.entries(mirror)) {
      for (const [rung, rating] of Object.entries(rungs)) {
        expect(rating).toBe(botRating(Number(version), rung, "mirror"));
      }
    }
  });

  /** And the default table is still the rubber one, unchanged for every other format. */
  it("leaves the default table as it was", () => {
    const plain = botAnchors();
    for (const [version, rungs] of Object.entries(plain)) {
      for (const [rung, rating] of Object.entries(rungs)) {
        expect(rating).toBe(botRating(Number(version), rung));
      }
    }
  });

  /**
   * Anti-vacuity: the two tables have to actually differ somewhere, or both tests above
   * would pass against a `botAnchors` that ignored its argument — which is exactly the
   * bug being fixed, one layer down.
   */
  it("the two tables differ, at the rung that remembers", () => {
    const plain = botAnchors();
    const mirror = botAnchors("mirror");
    const differing = Object.keys(plain).flatMap((version) =>
      Object.keys(plain[version]!).filter(
        (rung) => plain[version]![rung] !== mirror[version]![rung],
      ),
    );
    expect(differing.length).toBeGreaterThan(0);
    expect(new Set(differing)).toEqual(new Set(["championship"]));
  });
});
