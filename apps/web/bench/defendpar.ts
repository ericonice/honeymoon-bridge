/**
 * How accurately each estimator answers "how many tricks do *they* take declaring this".
 *
 * **The premise behind `searchDefending`, never measured until now.** The figure that
 * motivated it — 1.04 tricks of error against par, where counting gives 1.54 — is a
 * *declaring* number: it was taken with the opponent on lead, which is this seat
 * declaring. The branch the capability changes asks the opposite question, and nobody
 * had checked whether a searched estimate beats a counted one there.
 *
 * There is a specific reason to doubt it. The search guesses the hand it cannot see
 * from `sampleOpponentHand`, and `impliedByTheirBid` exists precisely because this
 * seat's own read of a hand the opponent has *bid* is weak — so the search may be
 * averaging over hands that are wrong in the way that matters.
 *
 * Measured against double-dummy par for the real hands, at real auction positions: the
 * bot drives the draw and the auction, and every decision it faces with the opponent's
 * contract standing is one case. Both estimators see exactly the same position, so the
 * deal cancels.
 *
 *   npx vite-node bench/defendpar.ts [deals]
 */
import { applyAction, newRubber, opponentOf, startDeal, viewFor } from "@hb/engine";
import type { Card, DealState, PlayerId, Strain } from "@hb/engine";
import { createRng } from "@hb/engine";
import { DEFAULT_GAME_EQUITY } from "../src/bot/bidValue.js";
import { botForLevel } from "../src/bot/build.js";
import { levelFor } from "../src/bot/difficulty.js";
import { defendingTricks } from "../src/bot/evaluate.js";
import { LATEST_RELEASE } from "../src/bot/release.js";
import { sampleOpponentHand } from "../src/bot/sample.js";
import { solve } from "../src/bot/solver.js";
import { botActionFor } from "../src/game/botTurn.js";
import { botTuningFor } from "../src/game/botTuning.js";
import { createProgress } from "./progress.js";

const TRICKS = 13;
const deals = Number(process.argv[2] ?? 120);
const ruff = Number(process.argv.find((one) => one.startsWith("ruff="))?.slice("ruff=".length) ?? 0);
const level = levelFor("championship");
const tuning = botTuningFor({
  disguise: true,
  format: "duplicate",
  gameEquity: DEFAULT_GAME_EQUITY,
  level,
  release: LATEST_RELEASE,
});

/**
 * How much the blend leans on their bid rather than on this hand.
 *
 * `THEIR_BID_WEIGHT` ships at 0.75 and was fitted when the own-hand term carried about
 * 1.5 tricks of error. That term is better now, so the optimum should have moved — and
 * because the correction to it measured as a **matchpoint null** purely through
 * dilution at 0.25, the weight is the thing that decides whether any of it can pay.
 *
 * Swept here rather than in `bench/rubber.ts` because accuracy against par is minutes
 * where a rubber margin is hours, and a weight is exactly the kind of constant accuracy
 * can locate. Whatever wins still has to be confirmed in matchpoints: this file has
 * three findings where a better estimate bought nothing.
 */
const WEIGHTS = [0, 0.25, 0.5, 0.75, 1] as const;
const blendErrors = new Map<number, number[]>(WEIGHTS.map((one) => [one, []]));

const countedErrors: number[] = [];
const searchedErrors: number[] = [];
let cases = 0;

function lastBid(view: ReturnType<typeof viewFor>): { by: PlayerId; level: number; strain: Strain } | null {
  const bids = view.auction.filter((one) => one.call.type === "bid");
  const last = bids[bids.length - 1];
  return last === undefined || last.call.type !== "bid"
    ? null
    : { by: last.by, level: last.call.bid.level, strain: last.call.bid.strain };
}

const progress = createProgress(deals, "deals", 10);

for (let seed = 1; seed <= deals; seed += 1) {
  const bot = botForLevel({ level, rng: createRng(seed), tuning });
  const standing = { rubber: newRubber(), vulnerable: [false, false] as const };
  let state: DealState = startDeal({ seed, starter: (seed % 2) as PlayerId });

  while (state.phase === "draw" || state.phase === "auction") {
    const seat = state.toAct;
    const view = viewFor(state, seat);
    const standingBid = state.phase === "auction" ? lastBid(view) : null;

    // Their contract is on the table and this seat has to price it — exactly the
    // branch `searchDefending` changes, and the only position worth measuring.
    if (standingBid !== null && standingBid.by !== seat) {
      const them = opponentOf(seat);
      const strain = standingBid.strain;

      // What the counted model says they take declaring — `estimateFor`'s own
      // expression, before the blend with their bid level.
      // **The discount is passed explicitly, because absent means off.** `defendingRuff`
      // is per release and defaults to nothing, so a bench omitting it measures the
      // flat count — which is what the first weight sweep did without saying so.
      // `ruff=0` measures the term as v2 has it, `ruff=0.25` as v3 does.
      const counted = TRICKS - defendingTricks(view.hand, strain, standingBid.level, ruff);

      // **The searched estimate, sampled and solved here rather than through
      // `searchTricks`.** That function searches one position — what *this* seat takes
      // declaring — and the second solve it briefly carried is gone, because this
      // measurement is what removed it. Keeping the bench self-contained is what lets
      // the claim be re-checked without keeping a production code path nobody uses.
      //
      // The same twenty-five samples the bidder would have had, drawn the same way: the
      // sampler reads the auction and this seat's own discards, so the search is given
      // exactly what it gets in play.
      const rng = createRng(seed * 31 + view.auction.length);
      let total = 0;
      const SAMPLES = 25;
      for (let sample = 0; sample < SAMPLES; sample += 1) {
        const theirs = sampleOpponentHand(view, rng, state.discards[seat]);
        const hands: [readonly Card[], readonly Card[]] = [[], []];
        hands[seat] = view.hand;
        hands[them] = theirs;
        // They declare, so this seat leads — the position actually being estimated.
        total += solve({ hands, leader: seat, strain, trick: [] }).tricks[them];
      }
      const searched = { mean: total / SAMPLES, samples: SAMPLES };

      // The truth for these two hands: they declare, so this seat leads.
      const par = solve({
        hands: [state.hands[0], state.hands[1]],
        leader: seat,
        strain,
        trick: [],
      }).tricks[them];

      // The other half of the blend: what their own bid claims they hold. `estimateFor`
      // reads it exactly this way — level plus book, taken as a claim about tricks.
      const fromTheirBid = standingBid.level + 6;
      for (const weight of WEIGHTS) {
        blendErrors.get(weight)!.push(Math.abs((1 - weight) * counted + weight * fromTheirBid - par));
      }

      if (searched.samples > 0) {
        cases += 1;
        countedErrors.push(Math.abs(counted - par));
        searchedErrors.push(Math.abs(searched.mean - par));
      }
    }

    state = applyAction(state, seat, botActionFor({ bot, seat, standing: standing as never, state }));
  }
  progress(seed);
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, one) => total + one, 0) / Math.max(1, values.length);
const error = (values: readonly number[]): number => {
  const m = mean(values);
  const variance = mean(values.map((one) => (one - m) ** 2));
  return Math.sqrt(variance / Math.max(1, values.length));
};
const paired = countedErrors.map((one, at) => one - searchedErrors[at]!);

console.log(
  `\n  ${cases} positions over ${deals} deals, ${LATEST_RELEASE.name} at Championship` +
    `, defendingRuff ${ruff}\n` +
    `\n  mean absolute error against double-dummy par, in tricks\n` +
    `    counting   ${mean(countedErrors).toFixed(2)} ± ${error(countedErrors).toFixed(2)}\n` +
    `    searching  ${mean(searchedErrors).toFixed(2)} ± ${error(searchedErrors).toFixed(2)}\n` +
    `\n  paired difference  ${mean(paired) >= 0 ? "+" : ""}${mean(paired).toFixed(2)}` +
    ` ± ${error(paired).toFixed(2)}  (positive means searching is more accurate)\n`,
);

console.log("  the blend, by how much it leans on their bid\n");
for (const weight of WEIGHTS) {
  const one = blendErrors.get(weight)!;
  console.log(
    `    ${weight.toFixed(2)}${weight === 0.75 ? " (shipped)" : "         "}  ` +
      `${mean(one).toFixed(3)} ± ${error(one).toFixed(3)}`,
  );
}
console.log();
