import { STRAINS, applyAction, createRng, startDeal } from "@hb/engine";
import type { AuctionEntry, Card, Contract, Level, PlayerId, Strain } from "@hb/engine";
import { DEFAULT_GAME_EQUITY, expectedValue } from "../src/bot/bidValue.js";
import { estimatedTricks } from "../src/bot/evaluate.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/**
 * Why the bidder bid that.
 *
 * Aggregate benches say a bidder is wrong; they never say which comparison went
 * wrong. This prints the actual numbers behind one decision — what the hand is
 * estimated at in each strain, and what every level of the best one is worth —
 * so an argument about whether the equity term or the risk model is at fault
 * can be settled by reading it off.
 *
 *   npx vite-node bench/auction.ts [deals]
 */

function handsFor(seed: number, starter: PlayerId) {
  const bot = createHeuristicBot(createRng(seed));
  let state = startDeal({ seed, starter });
  while (state.phase === "draw") {
    state = applyAction(state, state.toAct, botActionFor({ bot, seat: state.toAct, standing: loveAll(), state }));
  }
  return state.initialHands!;
}

/**
 * How often a seat named a suit it did not hold.
 *
 * Measured rather than assumed, because a knob that changes nothing and a knob
 * that changes something harmful look identical from the outcome alone — two
 * psych settings once produced the same win-loss count to the rubber, which was
 * not evidence that lying does not pay but evidence that nobody had lied.
 */
function psychsIn(auction: readonly AuctionEntry[], hand: readonly Card[], seat: PlayerId): number {
  let count = 0;
  for (const entry of auction) {
    if (entry.by !== seat || entry.call.type !== "bid") {
      continue;
    }
    const { level, strain } = entry.call.bid;
    if (level === 1 && strain !== "NT" && hand.filter((card) => card.suit === strain).length <= 3) {
      count += 1;
    }
  }
  return count;
}

/** The auction as both bots actually hold it, which is where a competitive spiral would show. */
function auctionFor(seed: number, starter: PlayerId): readonly AuctionEntry[] {
  const bot = createHeuristicBot(createRng(seed));
  let state = startDeal({ seed, starter });
  while (state.phase === "draw" || state.phase === "auction") {
    state = applyAction(
      state,
      state.toAct,
      botActionFor({ bot, seat: state.toAct, standing: loveAll(), state }),
    );
  }
  return state.auction;
}

function spell(auction: readonly AuctionEntry[]): string {
  return auction
    .map((entry) => {
      const call = entry.call;
      const said =
        call.type === "bid" ? `${call.bid.level}${call.bid.strain}` : call.type.slice(0, 4);
      return `${entry.by}:${said}`;
    })
    .join(" ");
}

function run(deals: number): void {
  const standing = loveAll();
  let psyched = 0;

  for (let seed = 1; seed <= deals; seed++) {
    const hands = handsFor(seed, (seed % 2) as PlayerId);
    const hand = hands[0];

    let best: Strain = "NT";
    for (const strain of STRAINS) {
      if (estimatedTricks(hand, strain) > estimatedTricks(hand, best)) {
        best = strain;
      }
    }

    const estimate = estimatedTricks(hand, best);
    const values = ([1, 2, 3, 4, 5, 6, 7] as Level[]).map((level) => {
      const contract: Contract = { declarer: 0, doubling: "none", level, strain: best };
      return expectedValue({
        contract,
        estimate,
        exposedToDouble: true,
        gameEquity: DEFAULT_GAME_EQUITY,
        hand,
        me: 0,
        standing,
      });
    });

    const auction = auctionFor(seed, (seed % 2) as PlayerId);
    const lies = psychsIn(auction, hand, 0);
    psyched += lies > 0 ? 1 : 0;

    const top = values.indexOf(Math.max(...values)) + 1;
    if (deals <= 20) {
      console.log(
        `seed ${String(seed).padStart(3)}  ${best.padEnd(2)} est ${estimate.toFixed(1)}  ` +
          `alone ${top}${best}${lies > 0 ? "  PSYCH" : ""}  |  ${spell(auction)}`,
      );
    }
  }

  console.log(
    `
  seat 0 psyched in ${psyched} of ${deals} deals — ` +
      `${((100 * psyched) / deals).toFixed(0)}%, about 1 in ${(deals / Math.max(1, psyched)).toFixed(1)}`,
  );
}

run(Number(process.argv[2] ?? 12));
