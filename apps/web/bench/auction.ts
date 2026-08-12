import { STRAINS, applyAction, createRng, startDeal } from "@hb/engine";
import type { AuctionEntry, Card, Contract, Level, PlayerId, Strain } from "@hb/engine";
import { DEFAULT_GAME_EQUITY, expectedValue } from "../src/bot/bidValue.js";
import { estimatedTricks } from "../src/bot/evaluate.js";
import { createHeuristicBot, DISGUISE_CREDIT_ON } from "../src/bot/heuristicBot.js";
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
 * Also reports how often the "bid unpredictably" setting actually changes the
 * opening bid, since that credit defaults to zero everywhere else and a knob
 * nobody has switched on cannot be seen doing anything from the rest of this
 * bench alone.
 *
 *   npx vite-node bench/auction.ts [deals]
 */

function handsFor(seed: number, starter: PlayerId) {
  const bot = createHeuristicBot(createRng(seed), { disguiseCredit: DISGUISE_CREDIT_ON });
  let state = startDeal({ seed, starter });
  while (state.phase === "draw") {
    state = applyAction(state, state.toAct, botActionFor({ bot, seat: state.toAct, standing: loveAll(), state }));
  }
  return state.initialHands!;
}

/**
 * Whether a seat's opening bid named a suit other than its own best one, and
 * if so whether that suit was thin (exactly three cards, meant to be rare) or
 * comfortable (four or more, meant to be the common case) — plus, as a
 * correctness check on the floor itself, whether anything ever fired below
 * three cards at all, which should never happen regardless of credit.
 *
 * Measured rather than assumed, because a knob that changes nothing and a knob
 * that changes something harmful look identical from the outcome alone — two
 * settings of the old psych credit once produced the same win-loss count to
 * the rubber, which was not evidence that the deception does not pay but
 * evidence that nobody had lied.
 */
function disguiseIn(
  auction: readonly AuctionEntry[],
  hand: readonly Card[],
  seat: PlayerId,
  best: Strain,
): "thin" | "comfortable" | "below-floor" | null {
  for (const entry of auction) {
    if (entry.by !== seat || entry.call.type !== "bid") {
      continue;
    }
    const { level, strain } = entry.call.bid;
    if (level !== 1 || strain === "NT" || strain === best) {
      continue;
    }
    const length = hand.filter((card) => card.suit === strain).length;
    return length < 3 ? "below-floor" : length === 3 ? "thin" : "comfortable";
  }
  return null;
}

/** The auction as both bots actually hold it, which is where a competitive spiral would show. */
function auctionFor(seed: number, starter: PlayerId): readonly AuctionEntry[] {
  const bot = createHeuristicBot(createRng(seed), { disguiseCredit: DISGUISE_CREDIT_ON });
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
  let thin = 0;
  let comfortable = 0;
  let belowFloor = 0;

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
    const disguise = disguiseIn(auction, hand, 0, best);
    if (disguise === "thin") {
      thin += 1;
    } else if (disguise === "comfortable") {
      comfortable += 1;
    } else if (disguise === "below-floor") {
      belowFloor += 1;
    }

    const top = values.indexOf(Math.max(...values)) + 1;
    if (deals <= 20) {
      console.log(
        `seed ${String(seed).padStart(3)}  ${best.padEnd(2)} est ${estimate.toFixed(1)}  ` +
          `alone ${top}${best}${disguise !== null ? `  ${disguise.toUpperCase()}` : ""}  |  ${spell(auction)}`,
      );
    }
  }

  const disguised = thin + comfortable;
  console.log(
    `
  seat 0 bid unpredictably in ${disguised} of ${deals} deals — ` +
      `${((100 * disguised) / deals).toFixed(0)}%, about 1 in ${(deals / Math.max(1, disguised)).toFixed(1)}\n` +
      `    comfortable (4+ cards): ${comfortable}\n` +
      `    thin (3 cards):         ${thin}\n` +
      `    below the floor (<3):   ${belowFloor}${belowFloor > 0 ? "  should be zero" : ""}`,
  );
}

run(Number(process.argv[2] ?? 12));
