import { currentDoubling, lastBidEntry, legalActions, opponentOf } from "@hb/engine";
import type { DealAction, DealState, Pair, PlayerId, Strain } from "@hb/engine";
import { solve } from "../src/bot/solver.js";

/**
 * A doubler that can see both hands, shared by every bench that needs one.
 *
 * **Extracted rather than copied, and that is not tidiness.** `bench/equity.ts` fits
 * the table that prices a standing, and it had no doubling at all — so the coefficients
 * v3 bids by were fitted from rubbers in which nobody ever doubled, while doubling
 * carries the whole of the bot's measured deficit against a person. Giving that bench a
 * doubler meant either sharing this one or writing a second, and this project has
 * already recorded what a second copy costs: `boardKeyOf` was duplicated under a comment
 * saying the two must agree, and they did not.
 */

/**
 * Undertricks the oracle needs to see before it doubles.
 *
 * The same number as `DOUBLED_FROM_DOWN` in `bidValue.ts`, and that is the whole
 * point rather than a coincidence. The bot's bidding assumes it gets doubled
 * exactly when it is going down two or more; against this reference that
 * assumption is *true*, so anything it still loses to a double is a wrong trick
 * estimate rather than a wrong model of the opponent. Isolating those two was
 * impossible while the reference only doubled from the five level.
 */
export const ORACLE_FROM_DOWN = 2;

/**
 * A double from a seat that can see both hands, used as a measuring instrument
 * and never as a player.
 *
 * This deliberately does not live in a `Bot`, and it is handed the `DealState`
 * rather than a `PlayerView` — which is exactly why it cannot be one. `solver.ts`
 * may never be given a position for a seat that is thinking, so the intercept
 * sits here in the bench, above the bot, and overrides the call it would have
 * made. A bot that could reach this would be a bot that cheats.
 *
 * Why an oracle rather than a stronger heuristic doubler: a heuristic one shares
 * the estimator's blind spots, so it fails to punish precisely the hands the
 * estimator misreads — which is the failure it is being built to catch. Recorded
 * games showed six of eight disasters doubled at the *four* level, all of them
 * invisible to a reference that starts at five.
 *
 * One solve per (declarer, strain) per deal. The cache is passed in rather than
 * closed over, because the hands are only final once the draw has ended and a
 * cache built any earlier would answer from a hand of the wrong size.
 */
export function oracleDouble(
  state: DealState,
  seat: PlayerId,
  cache: Map<string, number>,
): DealAction | null {
  if (state.phase !== "auction" || currentDoubling(state.auction) !== "none") {
    return null;
  }
  const entry = lastBidEntry(state.auction);
  if (entry === null || entry.by === seat || entry.call.type !== "bid") {
    return null;
  }
  if (
    !legalActions(state, seat).some(
      (action) => action.type === "call" && action.call.type === "double",
    )
  ) {
    return null;
  }

  const declarer = entry.by;
  const { level, strain } = entry.call.bid;
  return level + 6 - solvedTricks(state, declarer, strain, cache) >= ORACLE_FROM_DOWN
    ? { type: "call", call: { type: "double" } }
    : null;
}

function solvedTricks(
  state: DealState,
  declarer: PlayerId,
  strain: Strain,
  cache: Map<string, number>,
): number {
  const key = `${declarer}${strain}`;
  const known = cache.get(key);
  if (known !== undefined) {
    return known;
  }
  const solved = solve({
    hands: [state.hands[0], state.hands[1]],
    leader: opponentOf(declarer),
    strain,
    trick: [],
  }).tricks[declarer];
  cache.set(key, solved);
  return solved;
}
/**
 * Which seats the solver doubles for, from what was asked on the command line.
 *
 * Named rather than inlined because "the reference" is a *position* that swaps every
 * other play — the bench runs each rubber from both sides — so writing `them` at the
 * call site reads as a fixed seat and is not one.
 */
export function oracleSeatsFor(
  oracle: "both" | "reference" | "none",
  challenger: PlayerId,
  reference: PlayerId,
): Pair<boolean> {
  const seats: Pair<boolean> = [false, false];
  if (oracle === "none") {
    return seats;
  }
  seats[reference] = true;
  if (oracle === "both") {
    seats[challenger] = true;
  }
  return seats;
}

