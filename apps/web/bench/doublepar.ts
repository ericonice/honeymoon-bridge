/**
 * What the doubling decision is worth, measured one decision at a time.
 *
 * **The sitting is the wrong unit and that is why nothing could see this.** The bot
 * doubles about 5% of the boards it defends, so 240 corpus boards carry a dozen
 * doubles, diluted once into a board and again into a session's mean —
 * `bench/field.ts compare dmargin=` read +0.0 ± 0.0 at a threshold high enough to
 * stop every double and at one that stopped none, which is an instrument with
 * nothing in it rather than a null. Here every deal that reaches a contract is a
 * case, because every one of them is a double somebody took or passed up.
 *
 * **Scored on the final contract rather than at the moment of the call.** A double
 * can be run from — the auction is not over until somebody passes — so pricing the
 * contract that was standing when the bot thought about it would credit a double
 * against a contract nobody played. What the defender's decision was worth is what
 * the *settled* contract paid doubled against what it would have paid undoubled.
 *
 * Against double-dummy par, which cancels the deal and costs nothing, with the
 * caveat stated rather than buried: par is perfect defence, and the bot throws away
 * about 0.4 tricks a deal. So a contract that par says is one down sometimes makes,
 * and every figure here is therefore **optimistic about doubling** by roughly that
 * much on both sides of the comparison. The recorded Doop corpus is where the
 * real-play answer lives; this is the instrument for tuning against.
 *
 *   npx vite-node bench/doublepar.ts [deals] [dmargin=N]
 */
import {
  applyAction,
  createRng,
  newRubber,
  opponentOf,
  scoreDuplicateDeal,
  startDeal,
} from "@hb/engine";
import type { Contract, DealState, Pair, PlayerId } from "@hb/engine";
import { DEFAULT_GAME_EQUITY } from "../src/bot/bidValue.js";
import { botForLevel } from "../src/bot/build.js";
import { levelFor } from "../src/bot/difficulty.js";
import { LATEST_RELEASE } from "../src/bot/release.js";
import { solve } from "../src/bot/solver.js";
import { botActionFor } from "../src/game/botTurn.js";
import { botTuningFor } from "../src/game/botTuning.js";
import { createProgress } from "./progress.js";

const deals = Number(process.argv[2] ?? 400);
const marginArg = process.argv.find((one) => one.startsWith("dmargin="));
const dmargin = marginArg === undefined ? null : Number(marginArg.slice("dmargin=".length));
const level = levelFor("championship");
const base = botTuningFor({
  disguise: true,
  format: "duplicate",
  gameEquity: DEFAULT_GAME_EQUITY,
  level,
  release: LATEST_RELEASE,
});
/**
 * **`weight=W` is the reason this bench is worth more than a margin sweep.**
 * `THEIR_BID_WEIGHT` ships at 0.75 and the two instruments that have priced it
 * disagree: accuracy against par puts the optimum near 0.25, the original rubber
 * fit put it at 0.75, and the explanation offered for the gap was that the payoff
 * is asymmetric — a wrong double at the slam level is ruinous where a missed one
 * is cheap. That is a claim about *the doubling decision's* payoff, and this is the
 * first bench to price it in the currency the claim is about.
 */
/** `drift=D` takes the fitted level drift out of the defending estimate — `defenddrift.ts`. */
const driftArg = process.argv.find((one) => one.startsWith("drift="));
const drift = driftArg === undefined ? null : Number(driftArg.slice("drift=".length));
const weightArg = process.argv.find((one) => one.startsWith("weight="));
const weight = weightArg === undefined ? null : Number(weightArg.slice("weight=".length));
const tuning = {
  ...base,
  ...(dmargin === null ? {} : { doubleMargin: dmargin }),
  ...(weight === null ? {} : { theirBidWeight: weight }),
  ...(drift === null ? {} : { defendingDrift: drift }),
};

/** The four vulnerabilities in turn, so the figure is not one cell of the table. */
function vulnerableFor(seed: number): Pair<boolean> {
  const phase = seed % 4;
  return [phase === 1 || phase === 3, phase === 2 || phase === 3];
}

function netTo(
  seat: PlayerId,
  contract: Contract,
  tricks: Pair<number>,
  vulnerable: Pair<boolean>,
): number {
  const score = scoreDuplicateDeal({ contract, hands: [[], []], tricksWon: tricks }, vulnerable);
  return score.points[seat] - score.points[opponentOf(seat)];
}

interface Case {
  readonly doubled: boolean;
  readonly level: number;
  readonly set: boolean;
  /** What doubling this contract was worth to the defender, in points. */
  readonly worth: number;
}

const cases: Case[] = [];
const progress = createProgress(deals, "deals", 25);

for (let seed = 1; seed <= deals; seed += 1) {
  const bots = [
    botForLevel({ level, rng: createRng(seed * 2 + 1), tuning }),
    botForLevel({ level, rng: createRng(seed * 2 + 2), tuning }),
  ];
  const vulnerable = vulnerableFor(seed);
  const standing = { rubber: newRubber(), vulnerable };
  let state: DealState = startDeal({ seed, starter: (seed % 2) as PlayerId });
  while (state.phase === "draw" || state.phase === "auction") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat]!, seat, standing, state }));
  }
  const contract = state.contract;
  if (contract === null) {
    progress(seed);
    continue;
  }
  const declarer = contract.declarer;
  const defender = opponentOf(declarer);
  // Par for the settled strain: the defender leads, because declarer's opponent does.
  const took = solve({
    hands: [state.hands[0], state.hands[1]],
    leader: defender,
    strain: contract.strain,
    trick: [],
  }).tricks[declarer];
  const tricks: Pair<number> = declarer === 0 ? [took, 13 - took] : [13 - took, took];
  const bare: Contract = { ...contract, doubling: "none" };
  const hit: Contract = { ...contract, doubling: "doubled" };
  cases.push({
    doubled: contract.doubling !== "none",
    level: contract.level,
    set: took < contract.level + 6,
    worth: netTo(defender, hit, tricks, vulnerable) - netTo(defender, bare, tricks, vulnerable),
  });
  progress(seed, `${cases.length} contracts`);
}

function stats(label: string, xs: readonly number[]): void {
  if (xs.length === 0) {
    console.log(`  ${label.padEnd(40)} n=0`);
    return;
  }
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
  console.log(
    `  ${label.padEnd(40)} ${((m >= 0 ? "+" : "") + m.toFixed(0)).padStart(6)}  ±${(sd / Math.sqrt(xs.length)).toFixed(0)}`,
  );
}

const took = cases.filter((one) => one.doubled);
const passed = cases.filter((one) => !one.doubled);
const worthIt = cases.filter((one) => one.worth > 0);
console.log(`\n${cases.length} settled contracts from ${deals} deals${dmargin === null ? "" : `, doubleMargin ${dmargin}`}${weight === null ? "" : `, theirBidWeight ${weight}`}${drift === null ? "" : `, defendingDrift ${drift}`}\n`);
console.log(`  the bot doubled                          ${((took.length / cases.length) * 100).toFixed(1)}%`);
console.log(`  doubling would have paid                 ${((worthIt.length / cases.length) * 100).toFixed(1)}%  of them`);
console.log(`  of the doubles it took, par sets         ${took.length === 0 ? "—" : `${((took.filter((o) => o.set).length / took.length) * 100).toFixed(0)}%`}\n`);
console.log("  per settled contract, against never doubling:");
stats("never double", cases.map(() => 0));
stats("the bot as it is", cases.map((one) => (one.doubled ? one.worth : 0)));
stats("double everything", cases.map((one) => one.worth));
stats("an oracle: double iff it gains", cases.map((one) => Math.max(0, one.worth)));
console.log("\n  what it left on the table, and what it paid for being wrong:");
stats("doubles taken, worth", took.map((one) => one.worth));
stats("  of those, the ones that lost", took.filter((o) => o.worth < 0).map((one) => one.worth));
stats("doubles passed up, worth", passed.map((one) => one.worth));
stats("  of those, the ones worth taking", passed.filter((o) => o.worth > 0).map((one) => one.worth));
console.log("\n  by level of the settled contract:");
for (const band of [[1, 2], [3, 3], [4, 5], [6, 7]] as const) {
  const g = cases.filter((one) => one.level >= band[0] && one.level <= band[1]);
  if (g.length === 0) continue;
  const d = g.filter((one) => one.doubled);
  console.log(
    `    level ${band[0]}-${band[1]}  n=${String(g.length).padStart(4)}  doubled ${((d.length / g.length) * 100).toFixed(0)}%` +
      `  bot ${(g.reduce((t, o) => t + (o.doubled ? o.worth : 0), 0) / g.length).toFixed(0)}` +
      `  oracle ${(g.reduce((t, o) => t + Math.max(0, o.worth), 0) / g.length).toFixed(0)}` +
      `  always ${(g.reduce((t, o) => t + o.worth, 0) / g.length).toFixed(0)}`,
  );
}
