// How often do honors decide a match?
//
// Honors are worth 100 or 150 against a part-score of 60 to 90, and a quarter of deals
// here pay them — far more than in ordinary bridge, because each hand holds thirteen of
// only twenty-six dealt cards and the draw selects for high ones. The question is not
// whether that is a lot of points. It is whether they change who wins.
//
// **Play is held fixed and the deals are re-scored without honors**, which is the
// cheapest honest cut. It understates the effect, because honors also nudge what a
// contract is worth and therefore the bidding — a bidder that could not win them would
// bid differently. It is the right first question all the same: if holding everything
// else constant already flips a quarter of matches, nothing about the bidding will make
// that smaller.
import {
  actOn,
  createRng,
  dealOf,
  nextIn,
  startMatch,
  summarizeMatch,
} from "@hb/engine";
import type { DealRecord, MatchFormat, MatchState, Pair, PlayerId } from "@hb/engine";
import { botForLevel } from "../src/bot/build.js";
import { levelFor } from "../src/bot/difficulty.js";
import { releaseFor } from "../src/bot/release.js";
import type { BotRelease } from "../src/bot/release.js";
import { botActionFor } from "../src/game/botTurn.js";
import { createProgress } from "./progress.js";

/** What a deal paid each seat, and what of that was honors. */
interface Paid {
  readonly honors: Pair<number>;
  readonly points: Pair<number>;
}

function paidBy(record: DealRecord): Paid {
  const score = record.score;
  if (score === null) {
    return { honors: [0, 0], points: [0, 0] };
  }
  return {
    honors: score.detail.honors,
    points: [
      score.aboveLine[0] + score.belowLine[0],
      score.aboveLine[1] + score.belowLine[1],
    ],
  };
}

/**
 * Who wins on these totals.
 *
 * **Started from the match's real total rather than added up from the deals**, because a
 * rubber's totals are not the sum of its deals: winning pays `matchBonusFor`, and that
 * lands on the rubber rather than on any deal in it. Summing the pad would be short by
 * the bonus, and this file has already watched a screen make exactly that mistake.
 *
 * Subtracting honors from the real total is sound in a way that is worth stating:
 * **honors are scored above the line**, so they can never carry a side to a hundred and
 * never change who wins a game. The game and match bonuses are therefore identical in
 * both worlds and cancel out of the comparison entirely.
 */
function winnerOn(total: Pair<number>): PlayerId | null {
  return total[0] === total[1] ? null : total[0] > total[1] ? 0 : 1;
}

const matches = Number(process.argv[2] ?? 200);
const samples = Number(process.argv[3] ?? 0);
const format: MatchFormat = process.argv.includes("format=mirror")
  ? "mirror"
  : process.argv.includes("format=game")
    ? "game"
    : "rubber";

const level = levelFor("championship");
/**
 * **The two seats must differ, and mirror is why.**
 *
 * The first run of this put the same bot on both seats and reported *zero decided
 * mirrors in two hundred* — which reads as a broken measurement and is actually the
 * format working perfectly: identical players on mirrored deals score an exact dead
 * heat every time, because the second half is the first with the seats relabelled. A
 * drawn match has no winner to flip, so the question cannot be asked at all.
 *
 * That is the third time in this directory a control run has been mistaken for a
 * measurement. A bench whose two seats are the same is asking whether a rule matters to
 * nobody.
 */
const releases: Pair<BotRelease> = [releaseFor(3) ?? releaseFor(2)!, releaseFor(2)!];

let flipped = 0;
let decided = 0;
let dealsWithHonors = 0;
let deals = 0;
let honorPoints = 0;
let allPoints = 0;
/** Matches where the honors went overwhelmingly one way, as a sense of the swing. */
let lopsided = 0;

const progress = createProgress(matches, "matches");

for (let run = 0; run < matches; run++) {
  const seed = 20_000 + run * 131;
  const rng = () => createRng(seed + run);
  const bots: Pair<ReturnType<typeof botForLevel>> = [
    botForLevel({ level: { ...level, samples }, rng: rng(), tuning: releases[0].tuning }),
    botForLevel({ level: { ...level, samples }, rng: rng(), tuning: releases[1].tuning }),
  ];

  let match: MatchState = startMatch({
    firstBoard: 0,
    format,
    halfFormat: "game",
    seed,
    starter: (run % 2) as PlayerId,
  });

  const played: DealRecord[] = [];
  for (let deal = 0; deal < 60; deal++) {
    const standing = summarizeMatch(match).botStanding;
    while (dealOf(match).phase !== "complete") {
      const seat = dealOf(match).toAct;
      match = actOn(
        match,
        seat,
        botActionFor({ bot: bots[seat]!, seat, standing, state: dealOf(match) }),
      );
    }
    const summary = summarizeMatch(match);
    if (summary.complete) {
      const standingNow = summary.standing;
      if (standingNow.kind === "rubber") {
        played.push(...standingNow.previous, ...standingNow.history);
      }
      break;
    }
    match = nextIn(match, seed * 7 + deal);
  }

  for (const record of played) {
    deals += 1;
    const paid = paidBy(record);
    const honors = paid.honors[0] + paid.honors[1];
    if (honors > 0) {
      dealsWithHonors += 1;
    }
    honorPoints += honors;
    allPoints += paid.points[0] + paid.points[1];
  }

  const real = summarizeMatch(match).points;
  const honorsTo: Pair<number> = played.reduce<Pair<number>>(
    (sum, one) => {
      const paid = paidBy(one);
      return [sum[0] + paid.honors[0], sum[1] + paid.honors[1]];
    },
    [0, 0],
  );

  const withHonors = winnerOn(real);
  const without = winnerOn([real[0] - honorsTo[0], real[1] - honorsTo[1]]);
  if (withHonors !== null) {
    decided += 1;
    if (withHonors !== without) {
      flipped += 1;
    }
  }

  const swing = played.reduce((sum, one) => {
    const paid = paidBy(one);
    return sum + paid.honors[0] - paid.honors[1];
  }, 0);
  if (Math.abs(swing) >= 200) {
    lopsided += 1;
  }

  progress(run + 1, `${flipped}/${Math.max(decided, 1)} flipped`);
}

const share = (part: number, whole: number): string =>
  `${((100 * part) / Math.max(whole, 1)).toFixed(0)}%`;

console.log(`\n${matches} ${format} matches, ${samples}-sample card play`);
console.log(`  deals played                 ${deals}`);
console.log(`  deals paying honors          ${dealsWithHonors} (${share(dealsWithHonors, deals)})`);
console.log(`  honors as a share of points  ${share(honorPoints, allPoints)}`);
console.log(`  matches with a decided winner ${decided}`);
console.log(`  winner flips without honors  ${flipped} (${share(flipped, decided)})`);
console.log(`  honors swung 200+ one way    ${lopsided} (${share(lopsided, matches)})`);
