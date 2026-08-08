import { STRAINS, applyAction, createRng, opponentOf, startDeal, viewFor } from "@hb/engine";
import type { Card, Pair, PlayerId, PlayerView } from "@hb/engine";
import { shouldKeepCard } from "../src/bot/drawDecision.js";
import { solve } from "../src/bot/solver.js";
import { createProgress } from "./progress.js";

/**
 * Two draw policies competing for the same cards.
 *
 * The draw has no par. There is no correct keep-or-reject the way there is a
 * correct card, because the answer depends on thirteen cards nobody has seen
 * yet — so the only honest question is which policy ends up holding the better
 * hand, and the sharpest way to ask it is to sit them at the same table and deal
 * from the same stock. Seat 0 draws one way, seat 1 the other, from one shuffle.
 * The deal is then held identical rather than averaged over, and what is left is
 * the policy.
 *
 * Scoring the hands is where this could easily have gone wrong. `rawHandValue`
 * is the function the draw is *maximizing*, so using it here would ask each
 * policy to mark its own homework and reward whichever one agreed with the
 * scorer. Par comes from the solver, which knows nothing about hand evaluation,
 * and can therefore say a policy built a better hand even when that policy's own
 * scoring disagrees.
 *
 *   npm run bench:draw --workspace @hb/web -- [deals]
 */

type DrawPolicy = (view: PlayerView, remembered: readonly Card[]) => boolean;

/** Whatever the bot does today. */
const current: DrawPolicy = (view, remembered) =>
  shouldKeepCard(view.hand, view.pending!, remembered);

/**
 * A fixed, deliberately poor reference.
 *
 * Used when two variants of the real policy cannot both be loaded at once — a
 * module constant is one value per process — so each is measured against the
 * same immovable opponent and the two margins compared. Blunter than pairing
 * them directly, and the only option when the difference lives in a constant.
 */
const alwaysKeep: DrawPolicy = () => true;

/**
 * Turns where the two policies would have chosen differently.
 *
 * Reported because a margin of zero has two very different causes — a change
 * that fires and does not help, and a change that never fires — and they look
 * identical from the outcome. Counted for the challenger's seat only.
 */
let disagreements = 0;
let decisions = 0;

function drawOut(seed: number, starter: PlayerId, policies: Pair<DrawPolicy>, watch: PlayerId): Pair<readonly Card[]> {
  let state = startDeal({ seed, starter });
  while (state.phase === "draw") {
    const seat = state.toAct;
    // Through `viewFor`, so a policy is offered exactly what a bot would be:
    // its own hand and card 1, and nothing about the stock or the other seat.
    const view = viewFor(state, seat);
    const keep = policies[seat](view, state.discards[seat]);
    if (seat === watch) {
      decisions += 1;
      if (keep !== alwaysKeep(view, state.discards[seat])) {
        disagreements += 1;
      }
    }
    state = applyAction(state, seat, { type: "draw-decide", keep });
  }
  return state.initialHands!;
}

/** The tricks this hand takes in the strain that suits it best, played against the other. */
function bestPar(hands: Pair<readonly Card[]>, declarer: PlayerId): number {
  let best = 0;
  for (const strain of STRAINS) {
    const tricks = solve({ hands, leader: opponentOf(declarer), strain, trick: [] }).tricks;
    best = Math.max(best, tricks[declarer]);
  }
  return best;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function standardError(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const average = mean(values);
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function run(deals: number): void {
  const margins: number[] = [];
  const progress = createProgress(deals, "deals");

  for (let seed = 1; seed <= deals; seed++) {
    // Both seats, so drawing first cannot favor either policy. The starter draws
    // thirteen times from a fuller stock, which is not nothing.
    for (const challengerSeat of [0, 1] as const) {
      const policies: Pair<DrawPolicy> = [
        challengerSeat === 0 ? current : alwaysKeep,
        challengerSeat === 1 ? current : alwaysKeep,
      ];
      const hands = drawOut(seed, (seed % 2) as PlayerId, policies, challengerSeat);
      margins.push(
        bestPar(hands, challengerSeat) - bestPar(hands, opponentOf(challengerSeat)),
      );
    }
    progress(seed, `${mean(margins) >= 0 ? "+" : ""}${mean(margins).toFixed(2)} tricks`);
  }

  const margin = mean(margins);
  const error = standardError(margins);

  console.log(`\n  challenger's margin  ${margin >= 0 ? "+" : ""}${margin.toFixed(2)} tricks per deal`);
  console.log(`  standard error       ${error.toFixed(2)}`);
  console.log(`  that is              ${(Math.abs(margin) / Math.max(0.001, error)).toFixed(1)} standard errors`);
  console.log(`  hands built better   ${margins.filter((one) => one > 0).length} to ${margins.filter((one) => one < 0).length}`);
  console.log(
    `  decisions changed    ${disagreements} of ${decisions} — ` +
      `${((100 * disagreements) / Math.max(1, decisions)).toFixed(1)}%`,
  );
}

run(Number(process.argv[2] ?? 300));
