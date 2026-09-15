import { finishedHandsFor, opponentOf } from "@hb/engine";
import type { PlayerId, PlayerView } from "@hb/engine";
import { solve } from "../bot/solver.js";

/**
 * How the cards actually went, against how they could have gone.
 *
 * **A yardstick available on the first deal**, which is the thing a session with
 * nothing settled yet has none of. Duplicate answers "how am I doing" only once a
 * board comes back, and under a shuffled order that can be a long way in; this answers
 * a narrower question — *was that deal played well* — the moment it ends, and answers
 * it about the play rather than about the cards.
 *
 * **Computed from the view, not from privileged state.** Every deal is played to all
 * thirteen tricks, so `finishedHandsFor` can rebuild both hands out of the completed
 * tricks once they are all in. Nothing here could be known a moment earlier, which is
 * what makes it safe to draw at a table as well as against the computer.
 *
 * One solve, after the deal is over: about 7ms on this laptop and 2.6ms on a phone,
 * and nothing is waiting on it.
 */
export interface ParReading {
  /** Tricks the declaring side could have taken, both hands face up, both perfect. */
  readonly available: number;
  /**
   * Who fell short, or null when the play matched.
   *
   * **Attributable, because double dummy is the equilibrium.** If declarer took fewer
   * than were there, declarer's play is what cost them; if declarer took more, the
   * defence let them. Neither side can beat it, so the sign says which.
   *
   * The honest caveat, and it is why this is drawn quietly rather than as a verdict: a
   * trick that is there double dummy can be genuinely unfindable holding one hand, and
   * two errors on opposite sides can cancel and show as nothing at all.
   */
  readonly slipped: PlayerId | null;
  /** Tricks the declaring side actually took. */
  readonly taken: number;
}

export function parReadingFor(view: PlayerView): ParReading | null {
  const contract = view.contract;
  if (contract === null || view.phase !== "complete") {
    return null;
  }
  const hands = finishedHandsFor(view);
  if (hands === null) {
    return null;
  }

  const declarer = contract.declarer;
  const available = solve({
    hands,
    // The opening lead is the defender's, which is what makes this the position the
    // deal was actually played from rather than a different one with the same cards.
    leader: opponentOf(declarer),
    strain: contract.strain,
    trick: [],
  }).tricks[declarer];
  const taken = view.tricksWon[declarer];

  return {
    available,
    slipped: taken === available ? null : taken < available ? declarer : opponentOf(declarer),
    taken,
  };
}

/**
 * The line to draw, or null when there is nothing worth saying.
 *
 * **Silent when the play matched**, which is most well-played deals and is the whole
 * reason this can sit on a screen that already has a result on it: a line that appears
 * only when something was left behind is read, where one that appears every deal
 * saying "nothing happened" is furniture.
 *
 * Named relative to the reader, because "declarer" is a role the reader has to work out
 * and "you" is not.
 */
export function parNote(reading: ParReading | null, me: PlayerId, opponentName: string): string | null {
  if (reading === null || reading.slipped === null) {
    return null;
  }
  const missed = Math.abs(reading.available - reading.taken);
  const tricks = missed === 1 ? "a trick" : `${missed} tricks`;
  return reading.slipped === me
    ? `${tricks} went begging — double dummy the contract is ${reading.available}`
    : `${opponentName} left ${tricks} out there — double dummy the contract is ${reading.available}`;
}
