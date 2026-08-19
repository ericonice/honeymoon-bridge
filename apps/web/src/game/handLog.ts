import type {
  AuctionEntry,
  Card,
  CompletedTrick,
  Contract,
  DealRules,
  DrawTurnRecord,
  Pair,
  PlayerId,
  RubberState,
} from "@hb/engine";
import { storedSession } from "./account.js";
import type { Boldness, Strength } from "./identity.js";
import { playerToken } from "./identity.js";
import { handLogUrl, handsUrl } from "./serverUrl.js";

/** A completed robot-game deal, in the shape a later assessment against the solver needs. */
export interface HandLog {
  readonly auction: readonly AuctionEntry[];
  readonly boldness: Boldness;
  readonly botVersion: number;
  readonly completedTricks: readonly CompletedTrick[];
  readonly contract: Contract;
  readonly disguise: boolean;
  /** Which card each seat took on each draw turn — public, and half the deal. */
  readonly drawTurns: readonly DrawTurnRecord[];
  readonly initialHands: Pair<readonly Card[]>;
  /**
   * The house rules the deal was played under.
   *
   * Logged for the same reason `boldness` and `disguise` are: it changes what the
   * deal was, so a sample that pooled variant deals with ordinary ones would be
   * measuring two games at once and reporting one number. `bench/hands.ts` counts
   * it in its configuration census.
   */
  readonly rules: DealRules;
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
  readonly strength: Strength;
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
 * Fire-and-forget, exactly like `reportRobotRubber`: the device token always
 * goes along, the session only if there is one, and failure is swallowed —
 * this is a record of a hand already played, and logging it must never be
 * the thing that interrupts one.
 */
export async function reportHandLog(log: HandLog): Promise<void> {
  const session = storedSession();
  try {
    await fetch(handLogUrl(), {
      body: JSON.stringify({
        auction: log.auction,
        boldness: log.boldness,
        botVersion: log.botVersion,
        completedTricks: log.completedTricks,
        contract: log.contract,
        deviceToken: playerToken(),
        disguise: log.disguise,
        drawTurns: log.drawTurns,
        initialHands0: log.initialHands[0],
        initialHands1: log.initialHands[1],
        rules: log.rules,
        seed: log.seed,
        standing: log.standing,
        starter: log.starter,
        strength: log.strength,
        tricksWon: log.tricksWon,
      }),
      headers: {
        "Content-Type": "application/json",
        ...(session === null ? {} : { Authorization: `Bearer ${session}` }),
      },
      method: "POST",
    });
  } catch {
    // Offline, most likely — see `reportRobotRubber`.
  }
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
