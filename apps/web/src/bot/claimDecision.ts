import { TRICKS_PER_DEAL } from "@hb/engine";
import type { DealState } from "@hb/engine";
import { solve } from "./solver.js";

/**
 * Whether the computer should accept an outstanding claim.
 *
 * Deliberately not a `Bot` method, for the same reason `solver.ts` itself
 * isn't one: nothing in this folder may otherwise be handed a `DealState`,
 * only a `PlayerView`, because a `Bot` must never see hidden information. A
 * claim has already revealed the claimant's hand, though, so this isn't a
 * seat reasoning under uncertainty anymore — it's the same omniscient
 * question `solve` was built to answer, asked about whether the claim is
 * actually airtight. The claim is accepted iff best defense from here still
 * concedes every remaining trick; there is no reason for this to ever be
 * wrong, and no difficulty setting scales it, since a claim's outcome is a
 * rules question, not a skill one.
 */
export function shouldAcceptClaim(state: DealState): boolean {
  const claimant = state.claim;
  if (claimant === null || state.contract === null) {
    throw new Error("No claim is pending");
  }

  const remaining = TRICKS_PER_DEAL - state.completedTricks.length;
  const result = solve({
    hands: state.hands,
    leader: state.trickLeader,
    strain: state.contract.strain,
    trick: state.currentTrick,
  });

  return result.tricks[claimant] === remaining;
}
