import { describe, expect, it, test } from "vitest";
import { DIFFICULTIES } from "../../web/src/bot/difficulty.js";
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
function vsBot(winner: 0 | 1, version: number | null = 2, account = "ada"): Row {
  return {
    account0: account,
    account1: null,
    bot_version: version,
    token0: `device-${account}`,
    token1: ROBOT_TOKEN,
    winner,
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
