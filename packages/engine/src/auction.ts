import { STRAINS, STRAIN_ORDER, opponentOf } from "./cards.js";
import type { AuctionEntry, Bid, Call, Contract, Doubling, Level, PlayerId } from "./types.js";

const LEVELS: readonly Level[] = [1, 2, 3, 4, 5, 6, 7];

/** Strictly greater-than comparison of two bids. */
export function outranks(candidate: Bid, existing: Bid): boolean {
  if (candidate.level !== existing.level) {
    return candidate.level > existing.level;
  }
  return STRAIN_ORDER[candidate.strain] > STRAIN_ORDER[existing.strain];
}

export function lastBidEntry(auction: readonly AuctionEntry[]): AuctionEntry | null {
  for (let i = auction.length - 1; i >= 0; i--) {
    const entry = auction[i]!;
    if (entry.call.type === "bid") {
      return entry;
    }
  }
  return null;
}

/** The doubling state currently applying to the last bid made. */
export function currentDoubling(auction: readonly AuctionEntry[]): Doubling {
  let doubling: Doubling = "none";
  for (const entry of auction) {
    if (entry.call.type === "bid") {
      doubling = "none";
    } else if (entry.call.type === "double") {
      doubling = "doubled";
    } else if (entry.call.type === "redouble") {
      doubling = "redoubled";
    }
  }
  return doubling;
}

export function isLegalCall(auction: readonly AuctionEntry[], by: PlayerId, call: Call): boolean {
  const lastBid = lastBidEntry(auction);
  const doubling = currentDoubling(auction);

  switch (call.type) {
    case "pass": {
      return true;
    }
    case "bid": {
      return lastBid === null || outranks(call.bid, (lastBid.call as { bid: Bid }).bid);
    }
    case "double": {
      // Only over an opponent's undoubled bid.
      return lastBid !== null && lastBid.by === opponentOf(by) && doubling === "none";
    }
    case "redouble": {
      // Only over an opponent's double of one's own bid.
      return lastBid !== null && lastBid.by === by && doubling === "doubled";
    }
  }
}

export function legalCalls(auction: readonly AuctionEntry[], by: PlayerId): Call[] {
  const calls: Call[] = [{ type: "pass" }];
  for (const level of LEVELS) {
    for (const strain of STRAINS) {
      const call: Call = { type: "bid", bid: { level, strain } };
      if (isLegalCall(auction, by, call)) {
        calls.push(call);
      }
    }
  }
  if (isLegalCall(auction, by, { type: "double" })) {
    calls.push({ type: "double" });
  }
  if (isLegalCall(auction, by, { type: "redouble" })) {
    calls.push({ type: "redouble" });
  }
  return calls;
}

/**
 * With only two players there is no partner to pass around, so a single pass
 * following any bid closes the auction, and two opening passes pass the deal out.
 */
export function auctionIsClosed(auction: readonly AuctionEntry[]): boolean {
  const last = auction[auction.length - 1];
  if (last === undefined || last.call.type !== "pass") {
    return false;
  }
  if (lastBidEntry(auction) !== null) {
    return true;
  }
  return auction.length >= 2;
}

export function auctionIsPassedOut(auction: readonly AuctionEntry[]): boolean {
  return auctionIsClosed(auction) && lastBidEntry(auction) === null;
}

/**
 * The contract a closed auction settled on, or null if it was passed out.
 * Declarer is simply whoever made the final bid — there are no partnerships,
 * so the usual "first to bid the strain for their side" rule collapses to this.
 */
export function contractFrom(auction: readonly AuctionEntry[]): Contract | null {
  if (!auctionIsClosed(auction)) {
    return null;
  }
  const lastBid = lastBidEntry(auction);
  if (lastBid === null) {
    return null;
  }
  const { bid } = lastBid.call as { bid: Bid };
  return {
    declarer: lastBid.by,
    doubling: currentDoubling(auction),
    level: bid.level,
    strain: bid.strain,
  };
}
