import { describe, expect, it } from "vitest";
import { pinnedOpponents, PROVISIONAL_MATCHES } from "../src/ratings.js";
import type { PinnedOpponent, RatingPoint, Ratings } from "../src/ratings.js";
import { buildStandings, rankOf } from "../src/standings.js";
import type { Pool, Standings } from "../src/standings.js";

/** A rating walk's output, without walking anything. */
function ratings(
  entries: readonly { readonly id: string; readonly played: number; readonly rating: number }[],
): Ratings {
  const rating = new Map<string, number>();
  const played = new Map<string, number>();
  const history = new Map<string, RatingPoint[]>();
  for (const entry of entries) {
    rating.set(entry.id, entry.rating);
    played.set(entry.id, entry.played);
    history.set(entry.id, []);
  }
  return { history, played, rating };
}

function pool(
  accounts: readonly { readonly id: string; readonly name: string | null }[],
  tokens: Readonly<Record<string, readonly string[]>> = {},
): Pool {
  return { accounts, tokens: new Map(Object.entries(tokens)) };
}

const settled = PROVISIONAL_MATCHES;

const board = (options: {
  readonly bots?: readonly PinnedOpponent[];
  readonly me?: string;
  readonly pool: Pool;
  readonly ratings: Ratings;
}): Standings =>
  buildStandings({
    bots: options.bots ?? [],
    me: options.me ?? "ada",
    pool: options.pool,
    ratings: options.ratings,
  });

const names = (standings: Standings): (string | null)[] =>
  standings.ranked.map((row) => row.name);

describe("buildStandings", () => {
  it("ranks settled players by rating, strongest first", () => {
    const standings = board({
      pool: pool([
        { id: "ada", name: "Ada" },
        { id: "noah", name: "Noah" },
      ]),
      ratings: ratings([
        { id: "account:ada", played: settled, rating: 1450 },
        { id: "account:noah", played: settled, rating: 1600 },
      ]),
    });

    expect(names(standings)).toEqual(["Noah", "Ada"]);
    expect(standings.ranked.map((row) => row.rank)).toEqual([1, 2]);
    expect(standings.of).toBe(2);
  });

  // The fold `ratingOf` does for the asker, done for everybody. Without it a
  // person who played before signing in appears twice: once as their account and
  // once as the phone they started on.
  it("lists a person once when their matches are split across an account and a device", () => {
    const standings = board({
      pool: pool([{ id: "ada", name: "Ada" }], { ada: ["device-ada"] }),
      ratings: ratings([
        { id: "account:ada", played: settled, rating: 1520 },
        { id: "token:device-ada", played: 3, rating: 1480 },
      ]),
    });

    expect(names(standings)).toEqual(["Ada"]);
    // The identity holding the most matches is the one that represents them.
    expect(standings.ranked[0]!.rating).toBe(1520);
  });

  it("leaves out an account that has never finished a rated match", () => {
    const standings = board({
      pool: pool([
        { id: "ada", name: "Ada" },
        { id: "idle", name: "Nobody" },
      ]),
      ratings: ratings([{ id: "account:ada", played: settled, rating: 1500 }]),
    });

    expect(names(standings)).toEqual(["Ada"]);
  });

  it("leaves out an account with no name to print", () => {
    const standings = board({
      pool: pool([
        { id: "ada", name: "Ada" },
        { id: "nameless", name: null },
        { id: "blank", name: "   " },
      ]),
      ratings: ratings([
        { id: "account:ada", played: settled, rating: 1500 },
        { id: "account:nameless", played: settled, rating: 1700 },
        { id: "account:blank", played: settled, rating: 1650 },
      ]),
    });

    expect(names(standings)).toEqual(["Ada"]);
  });

  // A device nobody has claimed is a browser rather than a player, and there is
  // nothing to call it.
  it("leaves out a device token no account has claimed", () => {
    const standings = board({
      pool: pool([{ id: "ada", name: "Ada" }]),
      ratings: ratings([
        { id: "account:ada", played: settled, rating: 1500 },
        { id: "token:someone-else", played: 40, rating: 1900 },
      ]),
    });

    expect(names(standings)).toEqual(["Ada"]);
    expect(standings.settling).toEqual([]);
  });

  it("keeps a rating with too little behind it out of the ranking and says so", () => {
    const standings = board({
      pool: pool([
        { id: "ada", name: "Ada" },
        { id: "new", name: "Newcomer" },
      ]),
      ratings: ratings([
        { id: "account:ada", played: settled, rating: 1450 },
        // A single win over the strongest bot puts a new player above a settled
        // one, which is the prior talking rather than the player.
        { id: "account:new", played: 1, rating: 1523 },
      ]),
    });

    expect(names(standings)).toEqual(["Ada"]);
    expect(standings.settling.map((row) => row.name)).toEqual(["Newcomer"]);
    expect(standings.settling[0]!.rank).toBeNull();
    expect(standings.settledAfter).toBe(PROVISIONAL_MATCHES);
    expect(standings.of).toBe(1);
  });

  it("drops the computers in where their ratings fall, without ranking them", () => {
    const standings = board({
      bots: [
        { difficulty: "championship", rating: 1400, version: 3 },
        { difficulty: "kitchen", rating: 1050, version: 3 },
      ],
      pool: pool([
        { id: "ada", name: "Ada" },
        { id: "noah", name: "Noah" },
      ]),
      ratings: ratings([
        { id: "account:ada", played: settled, rating: 1500 },
        { id: "account:noah", played: settled, rating: 1200 },
      ]),
    });

    expect(names(standings)).toEqual(["Ada", null, "Noah", null]);
    expect(standings.ranked.map((row) => row.rank)).toEqual([1, null, 2, null]);
    expect(standings.ranked[1]!.difficulty).toBe("championship");
    // The ranks are positions among people, so a computer between two players
    // does not push the second one down to third.
    expect(standings.of).toBe(2);
  });

  // Matching it is not passing it, and the row order should not imply otherwise.
  it("puts a person above the computer on the same rating", () => {
    const standings = board({
      bots: [{ difficulty: "championship", rating: 1400, version: 3 }],
      pool: pool([{ id: "ada", name: "Ada" }]),
      ratings: ratings([{ id: "account:ada", played: settled, rating: 1400 }]),
    });

    expect(names(standings)).toEqual(["Ada", null]);
  });

  it("marks the asker's own row and nobody else's", () => {
    const standings = board({
      me: "noah",
      pool: pool([
        { id: "ada", name: "Ada" },
        { id: "noah", name: "Noah" },
      ]),
      ratings: ratings([
        { id: "account:ada", played: settled, rating: 1600 },
        { id: "account:noah", played: settled, rating: 1400 },
      ]),
    });

    expect(standings.ranked.filter((row) => row.you).map((row) => row.name)).toEqual(["Noah"]);
  });

  // The board is the first surface showing one player another's number, so what
  // it may not carry is worth asserting rather than reviewing: a device token
  // reclaims a dropped seat, and an account id is nobody else's to learn.
  it("carries no account id or device token", () => {
    const standings = board({
      pool: pool([{ id: "ada", name: "Ada" }], { ada: ["device-ada"] }),
      ratings: ratings([{ id: "account:ada", played: settled, rating: 1500 }]),
    });

    const wire = JSON.stringify(standings);
    expect(wire).not.toContain("ada");
    expect(wire).not.toContain("device-ada");
    // Anti-vacuity: a leak test that passes by sending nothing is worse than none.
    expect(wire).toContain("Ada");
  });
});

describe("rankOf", () => {
  it("gives the position and how many are ranked", () => {
    const standings = board({
      me: "noah",
      pool: pool([
        { id: "ada", name: "Ada" },
        { id: "noah", name: "Noah" },
      ]),
      ratings: ratings([
        { id: "account:ada", played: settled, rating: 1600 },
        { id: "account:noah", played: settled, rating: 1400 },
      ]),
    });

    expect(rankOf(standings)).toEqual({ of: 2, rank: 2 });
  });

  it("says nothing while the rating is still settling", () => {
    const standings = board({
      me: "new",
      pool: pool([{ id: "new", name: "Newcomer" }]),
      ratings: ratings([{ id: "account:new", played: 2, rating: 1520 }]),
    });

    expect(rankOf(standings)).toBeNull();
  });

  it("says nothing for somebody with no rated matches at all", () => {
    const standings = board({
      me: "idle",
      pool: pool([{ id: "idle", name: "Nobody" }]),
      ratings: ratings([]),
    });

    expect(rankOf(standings)).toBeNull();
  });
});

describe("pinnedOpponents", () => {
  it("is the newest release on every rung, strongest first", () => {
    const bots = pinnedOpponents();
    const versions = new Set(bots.map((bot) => bot.version));

    expect(versions.size).toBe(1);
    expect(bots.map((bot) => bot.difficulty)).toEqual(["championship", "club", "kitchen"]);
    expect(bots.map((bot) => bot.rating)).toEqual([...bots.map((bot) => bot.rating)].sort((a, b) => b - a));
  });
});
