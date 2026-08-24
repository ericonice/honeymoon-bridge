import { applyAction, createRng, startDeal, vulnerability } from "@hb/engine";
import type { DealState, Pair, PlayerId, RubberState } from "@hb/engine";
import { expect, test } from "vitest";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import type { BotTuning } from "../src/bot/heuristicBot.js";
import { BOT_RELEASES, LATEST_RELEASE, releaseFor } from "../src/bot/release.js";
import type { Standing } from "../src/bot/types.js";
import { botActionFor } from "../src/game/botTurn.js";

/**
 * What makes a superseded release still be that release.
 *
 * `release.ts` says a version is bumped when the play changes enough that
 * results either side of it are not the same opponent. Nothing enforced that,
 * and freezing a release's *tuning* would not either: the bot calls the shared
 * engine, the solver and `evaluate.ts`'s calibration, so a refit or a scoring
 * change alters how an old release plays while it goes on claiming to be that
 * release — which is worse than not keeping it, because the label is then lying.
 *
 * So the release is pinned by what it does. These transcripts were recorded
 * from v2 and any change to them is a change of opponent: either the version
 * needs bumping or the change was not meant to reach this release. That is the
 * thing v1 never had, and it is why v1's code is gone and its rating anchor
 * rests on a measurement nobody can repeat.
 *
 * Deliberately the auction and the draw, not the card play. Those are what a
 * bidding change moves, they are decided by the heuristic bot with no solver in
 * the loop, and they run in milliseconds — where `strength: "strong"` is 60
 * samples a card and would make a pinned deal too slow to keep in `npm test`.
 * `test/sampling.test.ts` covers the card play.
 */
const TRANSCRIPTS: Record<number, readonly string[]> = {
  2: [
    "KKSKSSSKSSSSKKKSKSSKSSKKSS | 0:3H 1:4D 0:4H 1:5D 0:x 1:P",
    "SSSSSSKSSSSKSKKKSKSKSSKKSS | 1:1S 0:3H 1:P",
    "SSKSSSSSSSSSSSSKSKKKSKSSSS | 0:1H 1:2D 0:2H 1:3D 0:P",
    "SSSKKKKKSSSSSKSSSSKKSKKSSS | 1:1NT 0:2H 1:2NT 0:3H 1:3S 0:P",
    "SSSKSSKSSSSSKSSKSSKKKKSSSS | 0:2S 1:3C 0:P",
    "SKSKKSSSSSKSSSKKSSSSKSSSSS | 1:2D 0:2H 1:3D 0:P",
    "KKSSSSSKSKKKSKKSSSSSKSKSSS | 0:1C 1:3S 0:P",
    "KKSSKSSSKSSKSKSSSKSKKSKSSS | 1:2C 0:2S 1:3C 0:P",
  ],
  3: [
    "KKSKSSSKSSSSKKKSKSSKSSKKSS | 0:4H 1:5D 0:5H 1:6D 0:x 1:P",
    "SSSSSSKSSSSKSKKKSKSKSSKKSS | 1:1S 0:4H 1:P",
    "SSKSSSSSSSSSSSSKSKKKSKSSSS | 0:2H 1:3D 0:P",
    "SSSKKKKKSSSSSKSSSSKKSKKSSS | 1:1NT 0:2H 1:2S 0:3H 1:3S 0:4H 1:4S 0:P",
    "SSSKSSKSSSSSKSSKSSKKKKSSSS | 0:2S 1:3C 0:3S 1:4C 0:P",
    "SKSKKSSSSSKSSSKKSSSSKSSSSS | 1:2D 0:2H 1:3D 0:3H 1:4D 0:P",
    "KKSSSSSKSKKKSKKSSSSSKSKSSS | 0:1C 1:4S 0:5C 1:x 0:P",
    "KKSSKSSSKSSKSKSSSKSKKSKSSS | 1:2C 0:2S 1:3C 0:P",
  ],
};

/**
 * A standing to bid at, built through `vulnerability` rather than stated.
 *
 * Vulnerability is derived from games won and asserting it separately here would
 * be a second copy of that rule in a test whose subject is something else.
 */
function standingWith(games: Pair<number>, part: Pair<number>): Standing {
  const rubber: RubberState = {
    aboveLine: [0, 0],
    belowLineTotal: part,
    complete: false,
    format: "rubber",
    gamesWon: games,
    matchBonus: [0, 0],
    partScore: part,
    winner: null,
  };
  return { rubber, vulnerable: vulnerability(rubber) };
}

const TAKE: Record<string, string> = { discard: "D", first: "K", second: "S" };

/** Both seats' draw choices and every call, as one line a diff can be read from. */
function transcript(seed: number, starter: PlayerId, standing: Standing, tuning: BotTuning): string {
  const bots = [
    createHeuristicBot(createRng(seed + 1), tuning),
    createHeuristicBot(createRng(seed + 2), tuning),
  ];
  let state: DealState = startDeal({ seed, starter });
  let draw = "";
  let auction = "";

  while (state.phase === "draw" || state.phase === "auction") {
    const seat = state.toAct;
    const action = botActionFor({ bot: bots[seat]!, seat, standing, state });
    if (action.type === "draw-decide") {
      draw += TAKE[action.take]!;
    } else if (action.type === "call") {
      const call = action.call;
      const said =
        call.type === "bid"
          ? `${call.bid.level}${call.bid.strain}`
          : call.type === "pass"
            ? "P"
            : call.type === "double"
              ? "x"
              : "xx";
      auction += `${auction === "" ? "" : " "}${seat}:${said}`;
    }
    state = applyAction(state, seat, action);
  }

  return `${draw} | ${auction}`;
}

/**
 * Chosen to reach the decisions a rubber-aware bidder is meant to change: a
 * part-score to either side, one game to either side, and both sides vulnerable
 * with the rubber on it. Love all alone would pin the one standing where the
 * position is worth nothing.
 */
const CASES: readonly { games: Pair<number>; part: Pair<number>; seed: number; starter: PlayerId }[] = [
  { games: [0, 0], part: [0, 0], seed: 1, starter: 0 },
  { games: [0, 0], part: [0, 0], seed: 2, starter: 1 },
  { games: [0, 0], part: [60, 0], seed: 3, starter: 0 },
  { games: [0, 0], part: [0, 60], seed: 4, starter: 1 },
  { games: [1, 0], part: [0, 0], seed: 5, starter: 0 },
  { games: [0, 1], part: [0, 0], seed: 6, starter: 1 },
  { games: [1, 1], part: [0, 0], seed: 7, starter: 0 },
  { games: [1, 0], part: [0, 30], seed: 8, starter: 1 },
];

for (const release of BOT_RELEASES) {
  test(`v${release.version} ${release.name} draws and bids exactly as it did when it was released`, () => {
    const pinned = TRANSCRIPTS[release.version];
    // A release with no transcripts is a release nothing is preserving. Failing
    // here is the point: the pin has to be recorded before the next change lands,
    // because after one you can no longer record what it used to do.
    expect(pinned).toBeDefined();
    const played = CASES.map((one) =>
      transcript(one.seed, one.starter, standingWith(one.games, one.part), release.tuning),
    );
    expect(played).toEqual(pinned);
  });
}

test("the releases are the ones these transcripts were recorded from", () => {
  expect(releaseFor(2)?.name).toBe("Bobby Orr");
  expect(releaseFor(3)?.name).toBe("Cammi Granato");
});

/** The two releases differ, which is the only thing that makes v3 a version. */
test("the two releases do not bid the same", () => {
  expect(TRANSCRIPTS[2]).not.toEqual(TRANSCRIPTS[3]);
});

test("a version this build has never heard of has no release rather than throwing", () => {
  expect(releaseFor(99)).toBeNull();
});

test("releases are listed oldest first, so the latest is the last of them", () => {
  const versions = BOT_RELEASES.map((release) => release.version);
  expect(versions).toEqual([...versions].sort((one, two) => one - two));
  expect(LATEST_RELEASE).toBe(BOT_RELEASES[BOT_RELEASES.length - 1]);
});

test("no two releases share a version, since a version is what a record is keyed by", () => {
  const versions = BOT_RELEASES.map((release) => release.version);
  expect(new Set(versions).size).toBe(versions.length);
});

/** Alphabetical by first name, so a list of releases reads in the order they existed. */
test("release names run alphabetically alongside their versions", () => {
  const names = BOT_RELEASES.map((release) => release.name);
  expect(names).toEqual([...names].sort((one, two) => one.localeCompare(two)));
});
