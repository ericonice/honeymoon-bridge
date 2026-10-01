/**
 * Whether the defending estimate is centred, level by level.
 *
 * `estimateFor`'s defending branch reads a bid as a claim about tricks — `level +
 * BOOK` — at one exchange rate for every height, and blends it with this hand's own
 * count. Nothing had ever asked whether the result sits on the truth. It does not,
 * and the error changes sign: a one-level bid is a floor and the estimate is too
 * harsh, a slam bid is where competition stopped and the estimate is too generous.
 *
 * Every position where a double is legal is a case, and the truth is double-dummy par
 * for the two hands as they actually lie, with this seat on lead because the opponent
 * declares. The bot drives both the draw and the auction, so the positions are the
 * ones it really reaches rather than constructed ones.
 *
 * This is what fitted `DEFENDING_DRIFT_PER_LEVEL`; re-run it after anything that moves
 * the defending estimate, which is `defendingTricks`, `THEIR_BID_WEIGHT` or the
 * calibration underneath them.
 *
 *   npx vite-node bench/defenddrift.ts [deals]
 */
import { applyAction, createRng, newRubber, opponentOf, startDeal, viewFor } from "@hb/engine";
import type { DealState, PlayerId } from "@hb/engine";
import { DEFAULT_GAME_EQUITY } from "../src/bot/bidValue.js";
import { botForLevel } from "../src/bot/build.js";
import { levelFor } from "../src/bot/difficulty.js";
import { RUFF_PER_LEVEL, defendingTricks } from "../src/bot/evaluate.js";
import { LATEST_RELEASE } from "../src/bot/release.js";
import { solve } from "../src/bot/solver.js";
import { botActionFor } from "../src/game/botTurn.js";
import { botTuningFor } from "../src/game/botTuning.js";
import type { Standing } from "../src/bot/types.js";
import { createProgress } from "./progress.js";

const TRICKS = 13;
const WEIGHT = 0.75; // THEIR_BID_WEIGHT, as estimateFor's defending branch uses it.
const deals = Number(process.argv[2] ?? 500);
const level = levelFor("championship");
const tuning = botTuningFor({
  disguise: true, format: "duplicate", gameEquity: DEFAULT_GAME_EQUITY, level,
  release: LATEST_RELEASE,
});
const progress = createProgress(deals, "deals", 50);
interface Row { level: number; err: number }
const rows: Row[] = [];

for (let seed = 1; seed <= deals; seed += 1) {
  const bots = [
    botForLevel({ level, rng: createRng(seed * 2 + 1), tuning }),
    botForLevel({ level, rng: createRng(seed * 2 + 2), tuning }),
  ];
  const standing: Standing = { rubber: newRubber(), vulnerable: [false, false] };
  let state: DealState = startDeal({ seed, starter: (seed % 2) as PlayerId });
  while (state.phase === "draw" || state.phase === "auction") {
    const seat = state.toAct;
    const view = viewFor(state, seat);
    const bids = view.auction.filter((e) => e.call.type === "bid");
    const last = bids[bids.length - 1];
    // A contract the *other* seat has bid and this seat must price — the double branch.
    if (state.phase === "auction" && last !== undefined && last.call.type === "bid" && last.by !== seat) {
      const strain = last.call.bid.strain;
      const lv = last.call.bid.level;
      const them = opponentOf(seat);
      // `estimateFor`'s defending branch, verbatim: this hand's read, blended with
      // the tricks their bid claims, at THEIR_BID_WEIGHT.
      const fromMyHand = TRICKS - defendingTricks(view.hand, strain, lv, RUFF_PER_LEVEL);
      const estimate = (1 - WEIGHT) * fromMyHand + WEIGHT * (lv + 6);
      const par = solve({ hands: [state.hands[0], state.hands[1]], leader: seat, strain, trick: [] }).tricks[them];
      rows.push({ level: lv, err: par - estimate });
    }
    state = applyAction(state, seat, botActionFor({ bot: bots[seat]!, seat, standing, state }));
  }
  progress(seed, `${rows.length} positions`);
}

function report(label: string, xs: readonly number[]): void {
  if (xs.length < 2) { console.log(`  ${label.padEnd(18)} n=${xs.length}`); return; }
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  // The tail that matters: the contract makes when the estimate said it would fail.
  const optimistic = xs.filter((x) => x > 1).length / xs.length;
  console.log(
    `  ${label.padEnd(18)} n=${String(xs.length).padStart(5)}  bias ${(m >= 0 ? "+" : "") + m.toFixed(2)}` +
      `  spread ${sd.toFixed(2)}   they beat the estimate by 2+ on ${(optimistic * 100).toFixed(0)}%`,
  );
}
// A straight line in the level, because that is the shape the bands show and the
// mechanism is monotone: a one-level bid is a floor somebody had to start at, and a
// seven-level bid is where competitive escalation stopped.
const n = rows.length;
const sx = rows.reduce((t, r) => t + r.level, 0);
const sy = rows.reduce((t, r) => t + r.err, 0);
const sxx = rows.reduce((t, r) => t + r.level * r.level, 0);
const sxy = rows.reduce((t, r) => t + r.level * r.err, 0);
const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
const intercept = (sy - slope * sx) / n;
console.log(`\nhow far the defending estimate lands from par, at every position where a double is legal`);
console.log(`the bot prices all of these with one Gaussian of width TRICK_SPREAD = 1.30\n`);
report("every level", rows.map((r) => r.err));
for (const band of [[1, 2], [3, 3], [4, 5], [6, 7]] as const) {
  report(`level ${band[0]}-${band[1]}`, rows.filter((r) => r.level >= band[0] && r.level <= band[1]).map((r) => r.err));
}
console.log(`\n  fitted  bias(level) = ${intercept.toFixed(3)} ${slope >= 0 ? "+" : "-"} ${Math.abs(slope).toFixed(3)} x level`);
console.log(`  zero at level ${(-intercept / slope).toFixed(2)}; at level 7 it is ${(intercept + 7 * slope).toFixed(2)}`);
const after = rows.map((r) => r.err - (intercept + slope * r.level));
report("residual after it", after);
