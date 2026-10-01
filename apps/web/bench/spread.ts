/**
 * Does the *width* of the trick distribution drive the bidder's overreach?
 *
 * **The last suspect standing.** The hand log says v3 bids about half a level above par
 * and that 273 doubled deals carry its whole remaining deficit — while the estimate's
 * *centre* is unbiased (+0.07 tricks over 2,380 hand-strain pairs). An unbiased centre
 * that still lands too high is being pushed there by the width: `TRICK_SPREAD` is one
 * fitted number applied to every hand, and with a game bonus in reach an over-wide
 * distribution makes the upside tail outweigh what the downside costs, so the bidder
 * buys a contract its own centre does not support.
 *
 * Three arms over the same logged deals, which is what separates width from centre:
 *
 *   counted   counted centre, fitted bell curve    — the shipped bidder with no search
 *   mean      searched centre, fitted bell curve   — only the centre moves
 *   odds      searched centre, searched spread     — the measured distribution
 *
 * **`mean` against `odds` is the test**: same centre, different width. `counted`
 * against `mean` is the control that says whether anything moved at all.
 *
 * Deals a person actually played, not generated ones — the population the deficit was
 * measured in. Both seats are driven by the arm's own bidder so the auction settles the
 * way that bidder would settle it, and par is solved for the contract it lands on.
 *
 *   npx vite-node bench/spread.ts [deals]
 */
import { createRng, opponentOf, sortHand } from "@hb/engine";
import type { Call, Contract, Pair, PlayerId, PlayerView, Strain } from "@hb/engine";
import { readFileSync } from "node:fs";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import type { BotTuning } from "../src/bot/heuristicBot.js";
import { solve } from "../src/bot/solver.js";
import { loveAll } from "../src/game/botTurn.js";
import { createProgress } from "./progress.js";

const BOOK = 6;
const deals = Number(process.argv[3] ?? 250);
const path = process.argv[2] ?? "hands.json";

interface Logged {
  readonly deal: {
    readonly initialHands: Pair<readonly { rank: number; suit: string }[]> | null;
    readonly starter?: PlayerId;
  };
}

const ARMS: readonly { readonly name: string; readonly tuning: BotTuning }[] = [
  { name: "counted", tuning: {} },
  { name: "mean", tuning: { searchBudgetMs: 2000, searchMode: "mean", searchSamples: 25 } },
  { name: "odds", tuning: { searchBudgetMs: 2000, searchMode: "odds", searchSamples: 25 } },
];

/** Drives a whole auction with one bidder in both seats, and returns what it settled on. */
function settle(hands: Pair<readonly never[]>, starter: PlayerId, tuning: BotTuning): Contract | null {
  const bots = [createHeuristicBot(createRng(7), tuning), createHeuristicBot(createRng(9), tuning)];
  const auction: { by: PlayerId; call: Call }[] = [];
  let seat = starter;

  for (let step = 0; step < 40; step += 1) {
    const view: PlayerView = {
      auction: auction.map((one) => ({ by: one.by, call: one.call })),
      claim: null,
      completedTricks: [],
      contract: null,
      currentTrick: [],
      drawTurns: [],
      hand: sortHand(hands[seat]),
      handSizes: [13, 13],
      me: seat,
      opponent: opponentOf(seat),
      passedOut: false,
      pending: null,
      phase: "auction",
      revealedHand: null,
      starter,
      stockRemaining: 0,
      toAct: seat,
      tricksWon: [0, 0],
      trickLeader: opponentOf(seat),
    } as PlayerView;

    const call = bots[seat]!.chooseCall(view, loveAll(), []);
    auction.push({ by: seat, call });

    // One pass closes it — §1 — and two opening passes pass the deal out.
    if (call.type === "pass") {
      const bids = auction.filter((one) => one.call.type === "bid");
      const last = bids[bids.length - 1];
      if (last === undefined || last.call.type !== "bid") {
        return null;
      }
      return {
        declarer: last.by,
        doubling: auction.some((one) => one.call.type === "double") ? "doubled" : "none",
        level: last.call.bid.level,
        strain: last.call.bid.strain,
      };
    }
    seat = opponentOf(seat);
  }
  return null;
}

const logged = (JSON.parse(readFileSync(path, "utf8")) as Logged[])
  .filter((one) => one.deal.initialHands !== null)
  .slice(0, deals);

console.log(`\n${logged.length} logged deals, three arms\n`);
const progress = createProgress(logged.length, "deals", 25);
const over: Record<string, number[]> = { counted: [], mean: [], odds: [] };
const levels: Record<string, number[]> = { counted: [], mean: [], odds: [] };

let passedOut = 0;

logged.forEach((hand, at) => {
  const hands = hand.deal.initialHands as unknown as Pair<readonly never[]>;
  const starter = hand.deal.starter ?? 0;

  // **Every arm or none**, which the first version got wrong: a deal one arm passes
  // out and another bids is a deal the three cannot be compared on, and pushing what
  // did settle left three arrays of different lengths — so the paired difference was
  // subtracting one deal's figure from another's. It read `NaN`, which is the only
  // reason it was noticed.
  const settled = ARMS.map((arm) => ({ arm, contract: settle(hands, starter, arm.tuning) }));
  if (settled.some((one) => one.contract === null)) {
    passedOut += 1;
    progress(at + 1);
    return;
  }

  for (const { arm, contract } of settled) {
    const par = solve({
      hands: [hands[0], hands[1]] as never,
      leader: opponentOf(contract!.declarer),
      strain: contract!.strain as Strain,
      trick: [],
    }).tricks[contract!.declarer];
    over[arm.name]!.push(contract!.level + BOOK - par);
    levels[arm.name]!.push(contract!.level);
  }
  progress(at + 1);
});

const mean = (values: readonly number[]): number =>
  values.reduce((total, one) => total + one, 0) / Math.max(1, values.length);
const stderr = (values: readonly number[]): number => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((one) => (one - m) ** 2)) / Math.max(1, values.length));
};

console.log(`\n  ${passedOut} deals passed out under at least one arm and are left out of all three\n`);
console.log("  level bid over what par allows, in tricks\n");
for (const arm of ARMS) {
  const one = over[arm.name]!;
  console.log(
    `    ${arm.name.padEnd(9)} ${mean(one) >= 0 ? "+" : ""}${mean(one).toFixed(2)} ± ${stderr(one).toFixed(2)}` +
      `   (bid ${mean(levels[arm.name]!).toFixed(2)}, over ${one.length} deals)`,
  );
}
const paired = over.mean!.map((one, at) => one - over.odds![at]!);
console.log(
  `\n  mean − odds  ${mean(paired) >= 0 ? "+" : ""}${mean(paired).toFixed(2)} ± ${stderr(paired).toFixed(2)}` +
    `   (positive means the searched width overreaches less)\n`,
);
