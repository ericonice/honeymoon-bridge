import type {
  AuctionEntry,
  Card,
  CompletedTrick,
  Contract,
  DrawTurnRecord,
  Pair,
  PlayerId,
  RubberState,
} from "@hb/engine";
import type { Difficulty } from "../bot/difficulty.js";
import { storedSession } from "./account.js";
import type { Boldness } from "./identity.js";
import { playerToken } from "./identity.js";
import { enqueue } from "./outbox.js";
import { handLogUrl, handsUrl } from "./serverUrl.js";

/** A completed robot-game deal, in the shape a later assessment against the solver needs. */
export interface HandLog {
  readonly auction: readonly AuctionEntry[];
  readonly boldness: Boldness;
  readonly botVersion: number;
  readonly completedTricks: readonly CompletedTrick[];
  readonly contract: Contract;
  /**
   * Which difficulty rung produced the deal.
   *
   * The rung decides the sample count, how much the bot remembers and how long it
   * searches, so it is what says *which opponent* this was — `strength` and
   * `boldness` beside it are dials from before difficulty existed. Optional on the
   * way out, for the same reason `botVersion` is: the service worker keeps old
   * builds in circulation and a deal somebody played is worth recording whether or
   * not their client knew the question.
   */
  readonly difficulty?: Difficulty;
  readonly disguise: boolean;
  /** Which card each seat took on each draw turn — public, and half the deal. */
  readonly drawTurns: readonly DrawTurnRecord[];
  readonly initialHands: Pair<readonly Card[]>;
  /**
   * The seed the deal was dealt from, which with `starter` reconstructs the
   * stock and so makes the draw phase replayable.
   *
   * `initialHands` is what the draw *produced*, so on its own it leaves 26 of a
   * deal's 52 decisions unmeasurable — the half where the hands are built. Safe
   * to send only because the deal is over: a seed in flight during a deal would
   * hand the whole stock order to anyone watching, which is why nothing carries
   * one until now.
   */
  readonly seed: number;
  /** The rubber and vulnerability the deal was bid at, which decides what a call was worth. */
  readonly standing: { readonly rubber: RubberState; readonly vulnerable: Pair<boolean> };
  readonly starter: PlayerId;
  readonly tricksWon: Pair<number>;
}

/**
 * Tells the server what a robot-game deal actually held, once it is complete.
 *
 * Every bench the bot has ever been measured against (`bench/par.ts` and
 * friends) generates its own deals. This is the same shape — both hands as
 * dealt, the auction, the contract, every trick — logged from a deal someone
 * actually played, so a later pass can run the identical solver-based mistake
 * analysis against real hands instead of only self-play.
 *
 * Queued rather than sent — see `outbox.ts`. This is the least urgent of the
 * reports and the most annoying to lose, since the whole value of a hand log is
 * having a run of real deals rather than most of one.
 */
export function reportHandLog(log: HandLog): void {
  enqueue({
    kind: "Hand log",
    url: handLogUrl(),
    // The device token names the player; a session only sharpens it.
    withSession: false,
    body: JSON.stringify({
      auction: log.auction,
      boldness: log.boldness,
      botVersion: log.botVersion,
      completedTricks: log.completedTricks,
      contract: log.contract,
      deviceToken: playerToken(),
      difficulty: log.difficulty,
      disguise: log.disguise,
      drawTurns: log.drawTurns,
      initialHands0: log.initialHands[0],
      initialHands1: log.initialHands[1],
      seed: log.seed,
      standing: log.standing,
      starter: log.starter,
      tricksWon: log.tricksWon,
    }),
  });
}

/**
 * The most recently logged deals, raw, for a playtester looking at what a
 * later assessment pass will actually see. Null on anything short of a real
 * answer — signed out, not a playtester, offline — since there is no partial
 * version of this worth showing.
 */
export async function fetchHandLogs(limit = 50): Promise<unknown[] | null> {
  const session = storedSession();
  if (session === null) {
    return null;
  }
  try {
    const response = await fetch(`${handsUrl()}?limit=${limit}`, {
      headers: { Authorization: `Bearer ${session}` },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { hands: unknown[] };
    return body.hands;
  } catch {
    return null;
  }
}
