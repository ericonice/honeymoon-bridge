import { describe, expect, it } from "vitest";
import {
  auctionIsClosed,
  auctionIsPassedOut,
  contractFrom,
  currentDoubling,
  isLegalCall,
  legalCalls,
  outranks,
} from "../src/auction.js";
import type { AuctionEntry, Call, Level, PlayerId, Strain } from "../src/types.js";

function bid(level: Level, strain: Strain): Call {
  return { type: "bid", bid: { level, strain } };
}

const PASS: Call = { type: "pass" };
const DOUBLE: Call = { type: "double" };
const REDOUBLE: Call = { type: "redouble" };

function auction(...calls: [PlayerId, Call][]): AuctionEntry[] {
  return calls.map(([by, call]) => ({ by, call }));
}

describe("bid ranking", () => {
  it("ranks by level first", () => {
    expect(outranks({ level: 2, strain: "C" }, { level: 1, strain: "NT" })).toBe(true);
    expect(outranks({ level: 1, strain: "NT" }, { level: 2, strain: "C" })).toBe(false);
  });

  it("ranks clubs lowest and no-trump highest within a level", () => {
    expect(outranks({ level: 1, strain: "D" }, { level: 1, strain: "C" })).toBe(true);
    expect(outranks({ level: 1, strain: "NT" }, { level: 1, strain: "S" })).toBe(true);
    expect(outranks({ level: 1, strain: "H" }, { level: 1, strain: "S" })).toBe(false);
  });

  it("does not consider an equal bid to outrank", () => {
    expect(outranks({ level: 3, strain: "H" }, { level: 3, strain: "H" })).toBe(false);
  });
});

describe("call legality", () => {
  it("allows any opening bid and forbids an opening double or redouble", () => {
    expect(isLegalCall([], 0, bid(1, "C"))).toBe(true);
    expect(isLegalCall([], 0, DOUBLE)).toBe(false);
    expect(isLegalCall([], 0, REDOUBLE)).toBe(false);
  });

  it("requires a bid to outrank the last bid", () => {
    const history = auction([0, bid(2, "H")]);
    expect(isLegalCall(history, 1, bid(2, "S"))).toBe(true);
    expect(isLegalCall(history, 1, bid(2, "D"))).toBe(false);
    expect(isLegalCall(history, 1, bid(2, "H"))).toBe(false);
  });

  it("allows doubling an opponent's bid but not one's own", () => {
    expect(isLegalCall(auction([0, bid(1, "S")]), 1, DOUBLE)).toBe(true);
    expect(isLegalCall(auction([0, bid(1, "S")]), 0, DOUBLE)).toBe(false);
  });

  it("forbids doubling an already-doubled contract", () => {
    const history = auction([0, bid(1, "S")], [1, DOUBLE]);
    expect(isLegalCall(history, 0, DOUBLE)).toBe(false);
  });

  it("allows redoubling only one's own doubled bid", () => {
    const history = auction([0, bid(1, "S")], [1, DOUBLE]);
    expect(isLegalCall(history, 0, REDOUBLE)).toBe(true);
    expect(isLegalCall(history, 1, REDOUBLE)).toBe(false);
  });

  it("clears the doubling when a higher bid is made", () => {
    const history = auction([0, bid(1, "S")], [1, DOUBLE], [0, bid(2, "S")]);
    expect(currentDoubling(history)).toBe("none");
    expect(isLegalCall(history, 1, DOUBLE)).toBe(true);
  });

  it("always allows a pass", () => {
    expect(isLegalCall([], 0, PASS)).toBe(true);
    expect(isLegalCall(auction([0, bid(7, "NT")]), 1, PASS)).toBe(true);
  });

  it("offers 35 contracts plus pass on an empty auction", () => {
    expect(legalCalls([], 0)).toHaveLength(36);
  });
});

describe("auction closure", () => {
  it("stays open after a single opening pass", () => {
    expect(auctionIsClosed(auction([0, PASS]))).toBe(false);
  });

  it("closes as passed out after two opening passes", () => {
    const history = auction([0, PASS], [1, PASS]);
    expect(auctionIsClosed(history)).toBe(true);
    expect(auctionIsPassedOut(history)).toBe(true);
    expect(contractFrom(history)).toBeNull();
  });

  it("closes on a single pass following a bid, since there is no partner", () => {
    const history = auction([0, bid(1, "NT")], [1, PASS]);
    expect(auctionIsClosed(history)).toBe(true);
    expect(auctionIsPassedOut(history)).toBe(false);
  });

  it("stays open while both players keep bidding", () => {
    const history = auction([0, bid(1, "C")], [1, bid(1, "H")], [0, bid(2, "C")]);
    expect(auctionIsClosed(history)).toBe(false);
  });

  it("names the player who made the final bid as declarer", () => {
    const history = auction([0, bid(1, "C")], [1, bid(2, "H")], [0, PASS]);
    expect(contractFrom(history)).toEqual({
      declarer: 1,
      doubling: "none",
      level: 2,
      strain: "H",
    });
  });

  it("carries a double into the contract", () => {
    const history = auction([0, bid(4, "S")], [1, DOUBLE], [0, PASS]);
    expect(contractFrom(history)).toEqual({
      declarer: 0,
      doubling: "doubled",
      level: 4,
      strain: "S",
    });
  });

  it("carries a redouble into the contract", () => {
    const history = auction([0, bid(3, "NT")], [1, DOUBLE], [0, REDOUBLE], [1, PASS]);
    expect(contractFrom(history)).toEqual({
      declarer: 0,
      doubling: "redoubled",
      level: 3,
      strain: "NT",
    });
  });

  it("lets an opening pass be followed by a bid without closing", () => {
    const history = auction([0, PASS], [1, bid(1, "H")]);
    expect(auctionIsClosed(history)).toBe(false);
    expect(contractFrom(auction([0, PASS], [1, bid(1, "H")], [0, PASS]))).toEqual({
      declarer: 1,
      doubling: "none",
      level: 1,
      strain: "H",
    });
  });
});
