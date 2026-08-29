import { opponentOf } from "./cards.js";
import type { PlayerId } from "./types.js";

/**
 * What one deal was dealt from, kept so the same deal can be dealt again.
 *
 * **Not on `DealRecord`, and that is the whole reason this is its own type.** The
 * scorepad's records cross the wire inside `MatchStanding`, and a seed
 * reconstructs an entire stock order — every card either player will be offered,
 * in order. So this lives on `TableState`, which is never projected, next to the
 * deal rather than inside the history. `packages/protocol/test/snapshot.test.ts`
 * walks every number in a serialized snapshot for exactly this class of mistake.
 */
export interface DealtBoard {
  readonly seed: number;
  readonly starter: PlayerId;
}

/**
 * The same boards, from the other side.
 *
 * A return match replays the deals of the match just finished, each with the
 * right to draw first handed to the other player — so you are offered the cards
 * your opponent was offered, and they get yours. That is the same mechanic
 * duplicate runs on, and it is exact for the same reason: a turn spends two stock
 * cards and turns alternate unconditionally, so each seat's thirteen offers are a
 * function of the seed alone, and `startDeal` gives the starter the first pair.
 * Flipping the starter swaps the two streams exactly.
 *
 * **Each starter is flipped individually rather than deriving the alternation.**
 * It is tempting to keep only the seeds and start the return match with the other
 * player, since `nextDeal` alternates from there — but it does not alternate
 * unconditionally: a deal passed out is redealt by the *same* player. The return
 * match will pass out different deals, so the two alternations diverge the first
 * time either does, and every board after that faces the wrong side. Recording
 * the starter costs a number a deal and removes the whole class of bug.
 */
export function mirrorOf(boards: readonly DealtBoard[]): DealtBoard[] {
  return boards.map((board) => ({ seed: board.seed, starter: opponentOf(board.starter) }));
}
