import {
  applyTableAction,
  createRng,
  currentDoubling,
  lastBidEntry,
  legalActionsForView,
  nextDeal,
  startTable,
  summarize,
  totalScore,
  vulnerability,
} from "@hb/engine";
import type { Bid, Call, Pair, PlayerId, PlayerView, Rng, TableState } from "@hb/engine";
import { defensiveTricks, estimatedTricks } from "../src/bot/evaluate.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { createSamplingBot } from "../src/bot/samplingBot.js";
import type { Bot } from "../src/bot/types.js";
import { botActionFor } from "../src/game/botTurn.js";
import { createProgress } from "./progress.js";

/**
 * Two bidders across full rubbers, which is the only bench that can see what a
 * bidder is for.
 *
 * Every other bench here plays deals in isolation, at love all. That is fine for
 * card play, which does not care what the score is, and useless for bidding,
 * which cares about almost nothing else: stretching for game, sacrificing to
 * deny one, and pricing a vulnerable penalty are all invisible when every deal
 * starts and ends at nil. A bidder measured that way is being marked on the one
 * part of its job it does not do.
 *
 * Card play is held fixed and by default deliberately cheap — both sides use the
 * heuristic rather than the sampling bot. It cancels between the two seats
 * anyway, and it is a hundred times faster, which is what makes enough rubbers
 * affordable to separate two bidders at all.
 *
 * Pass a sample count to play the cards properly instead. That is far slower and
 * is needed for exactly one question: **only the sampler reads the auction**, so
 * anything whose value is that the other seat believed something — a psych above
 * all — is invisible while the heuristic is holding the cards. A bench where
 * nobody can be fooled will always report that lying does not pay.
 *
 *   npm run bench:rubber --workspace @hb/web -- [rubbers] [samples]
 */

const MAX_DEALS = 60;

/**
 * The bidder as it was before contracts were priced in points: take the highest
 * bid the hand can expect to make, and pass when nothing qualifies.
 *
 * Kept here rather than in the bot, because it is not a bot any more — it is the
 * thing the current one has to beat. Leaving it in `heuristicBot.ts` as a mode
 * would mean shipping a second bidder nobody plays.
 */
function legacyBidder(base: Bot): Bot {
  return {
    ...base,
    chooseCall(view: PlayerView): Call {
      const calls = legalActionsForView(view).flatMap((action) =>
        action.type === "call" ? [action.call] : [],
      );
      const bids = calls.flatMap((call) => (call.type === "bid" ? [call.bid] : []));

      let best: Bid | null = null;
      for (const bid of bids) {
        if (estimatedTricks(view.hand, bid.strain) - (bid.level + 6) < 0) {
          continue;
        }
        if (best === null || bid.level > best.level) {
          best = bid;
        }
      }
      if (best !== null) {
        return { type: "bid", bid: best };
      }

      // The old rule doubled from the five level holding three defensive tricks.
      // Leaving it out made this reference unable to punish anything, which
      // quietly rigged every constant measured against it: a bot facing an
      // opponent who never doubles should of course fear doubles less and bid
      // games harder. A baseline has to be able to hurt you or it is not one.
      const entry = lastBidEntry(view.auction);
      const theirBid = entry !== null && entry.by !== view.me && entry.call.type === "bid"
        ? entry.call.bid
        : null;
      if (
        theirBid !== null &&
        theirBid.level >= 5 &&
        currentDoubling(view.auction) === "none" &&
        defensiveTricks(view.hand) >= 3 &&
        calls.some((call) => call.type === "double")
      ) {
        return { type: "double" };
      }

      return { type: "pass" };
    },
  };
}

interface Outcome {
  readonly deals: number;
  readonly points: Pair<number>;
  readonly winner: PlayerId | null;
}

function playRubber(seed: number, bots: Pair<Bot>): Outcome {
  const rng = createRng(seed);
  let table: TableState = startTable({ seed, starter: 0 });
  let deals = 0;

  while (deals < MAX_DEALS) {
    while (table.deal.phase !== "complete") {
      const seat = table.deal.toAct;
      table = applyTableAction(
        table,
        seat,
        botActionFor({
          bot: bots[seat],
          seat,
          standing: {
            rubber: table.rubberBefore,
            vulnerable: vulnerability(table.rubberBefore),
          },
          state: table.deal,
        }),
      );
    }

    deals += 1;
    const summary = summarize(table);
    if (summary.rubber.complete) {
      return {
        deals,
        points: totalScore(summary.rubber),
        winner: summary.rubber.winner,
      };
    }
    table = nextDeal(table, Math.floor(rng.next() * 0xffffffff));
  }

  const summary = summarize(table);
  return { deals, points: totalScore(summary.rubber), winner: null };
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function standardError(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const average = mean(values);
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function run(rubbers: number, samples: number): void {
  const cardPlay = (rng: Rng): Bot =>
    samples > 0 ? createSamplingBot(rng, samples) : createHeuristicBot(rng);

  const points: number[] = [];
  const dealCounts: number[] = [];
  let won = 0;
  let lost = 0;
  const started = performance.now();
  // Twenty seconds with heuristic card play and several minutes with the
  // sampler, so this reports either way rather than only when it is slow —
  // a bench that goes quiet exactly when it is expensive is the wrong way round.
  const playing = createProgress(rubbers, "rubbers");

  for (let seed = 1; seed <= rubbers; seed++) {
    // Every rubber twice with the seats exchanged, so dealing first and the
    // deal itself cannot favor either bidder.
    for (const challengerSeat of [0, 1] as const) {
      const make = (rng: Rng, challenger: boolean): Bot =>
        challenger ? cardPlay(rng) : legacyBidder(cardPlay(rng));
      const bots: Pair<Bot> = [
        make(createRng(seed), challengerSeat === 0),
        make(createRng(seed), challengerSeat === 1),
      ];

      const outcome = playRubber(seed, bots);
      const them = challengerSeat === 0 ? 1 : 0;
      points.push(outcome.points[challengerSeat] - outcome.points[them]);
      dealCounts.push(outcome.deals);
      if (outcome.winner === challengerSeat) {
        won += 1;
      } else if (outcome.winner === them) {
        lost += 1;
      }
    }
    playing(seed, `${mean(points) >= 0 ? "+" : ""}${mean(points).toFixed(0)} per rubber, ${won}-${lost}`);
  }

  const margin = mean(points);
  const error = standardError(points);

  console.log(
    `points bidder against the old "can I make it" bidder` +
      (samples > 0 ? `, ${samples}-sample card play` : `, heuristic card play`),
  );
  console.log(`${points.length} rubbers, both seats each, in ${((performance.now() - started) / 1000).toFixed(0)}s\n`);
  console.log(`  margin           ${margin >= 0 ? "+" : ""}${margin.toFixed(0)} points per rubber`);
  console.log(`  standard error   ${error.toFixed(0)}`);
  console.log(`  that is          ${(Math.abs(margin) / Math.max(1, error)).toFixed(1)} standard errors`);
  console.log(`  rubbers won      ${won} to ${lost}`);
  console.log(`  deals per rubber ${mean(dealCounts).toFixed(1)}`);
}

run(Number(process.argv[2] ?? 60), Number(process.argv[3] ?? 0));
