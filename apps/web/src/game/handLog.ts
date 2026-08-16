import type { AuctionEntry, Card, CompletedTrick, Contract, Pair } from "@hb/engine";
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
  readonly initialHands: Pair<readonly Card[]>;
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
        initialHands0: log.initialHands[0],
        initialHands1: log.initialHands[1],
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
