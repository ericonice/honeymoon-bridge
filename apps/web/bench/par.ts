import { applyAction, createRng, opponentOf, startDeal } from "@hb/engine";
import type { Card, DealState, Pair, PlayerId, Rng, Strain } from "@hb/engine";
import type { Bot } from "../src/bot/types.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { createSamplingBot } from "../src/bot/samplingBot.js";
import { solve, tricksAfter } from "../src/bot/solver.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";
import { createProgress } from "./progress.js";

/**
 * How far the bot's card play is from perfect.
 *
 * Not a test — it is slow, it asserts nothing, and its output is a number to
 * read rather than a threshold to pass. Head-to-head between two bots needs
 * thousands of deals to separate them because the deal itself is most of the
 * variance; measuring against par cancels the deal entirely, and says which
 * card was the mistake rather than only that the run went badly.
 *
 *   npx vite-node bench/par.ts [deals]
 */

interface Mistake {
  readonly by: PlayerId;
  readonly card: Card;
  readonly lost: number;
  readonly seed: number;
  readonly trick: number;
}

interface DealReport {
  readonly actual: Pair<number>;
  readonly declarer: PlayerId;
  /** Tricks the contract needs, book included. */
  readonly needed: number;
  readonly mistakes: readonly Mistake[];
  readonly par: Pair<number>;
  readonly seed: number;
  readonly strain: Strain;
}

type BotFactory = (rng: Rng) => Bot;

const BOTS: Record<string, BotFactory> = {
  heuristic: (rng) => createHeuristicBot(rng),
  sampling: (rng) => createSamplingBot(rng),
};

let makeBot: BotFactory = BOTS.heuristic!;

function playDeal(seed: number, starter: PlayerId): DealState {
  const bot = makeBot(createRng(seed));
  let state = startDeal({ seed, starter });
  while (state.phase !== "complete") {
    state = applyAction(state, state.toAct, botActionFor({ bot, seat: state.toAct, standing: loveAll(), state }));
  }
  return state;
}

function without(hand: readonly Card[], card: Card): Card[] {
  return hand.filter((held) => held.rank !== card.rank || held.suit !== card.suit);
}

/**
 * Replays the deal card by card, asking at each one what the position was worth
 * before it and after it. The difference is what that card cost its own side.
 */
function mistakesIn(state: DealState, seed: number): Mistake[] {
  const strain = state.contract!.strain;
  const hands: Pair<readonly Card[]> = [state.initialHands![0], state.initialHands![1]];
  const mistakes: Mistake[] = [];
  let held = hands;

  state.completedTricks.forEach((trick, index) => {
    let played: Card[] = [];
    for (const move of trick.cards) {
      const position = {
        hands: held,
        leader: trick.leader,
        strain,
        trick: trick.cards.slice(0, played.length),
      };
      const before = solve(position).tricks[move.by];
      const after = tricksAfter(position, move.card)[move.by];
      if (after < before) {
        mistakes.push({
          by: move.by,
          card: move.card,
          lost: before - after,
          seed,
          trick: index + 1,
        });
      }
      played = [...played, move.card];
      held = move.by === 0 ? [without(held[0], move.card), held[1]] : [held[0], without(held[1], move.card)];
    }
  });

  return mistakes;
}

function reportFor(seed: number, starter: PlayerId): DealReport | null {
  const state = playDeal(seed, starter);
  if (state.contract === null || state.passedOut) {
    return null;
  }

  const declarer = state.contract.declarer;
  const par = solve({
    hands: [state.initialHands![0], state.initialHands![1]],
    leader: opponentOf(declarer),
    strain: state.contract.strain,
    trick: [],
  }).tricks;

  return {
    actual: state.tricksWon,
    declarer,
    mistakes: mistakesIn(state, seed),
    needed: state.contract.level + 6,
    par,
    seed,
    strain: state.contract.strain,
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

/** Milliseconds for one 13-trick solve from a full deal, with the playing-out excluded. */
function timeFullSolve(states: readonly DealState[]): number {
  const positions = states.map((state) => ({
    hands: [state.initialHands![0], state.initialHands![1]] as Pair<readonly Card[]>,
    leader: opponentOf(state.contract!.declarer),
    strain: state.contract!.strain,
    trick: [],
  }));

  const started = performance.now();
  for (const position of positions) {
    solve(position);
  }
  return (performance.now() - started) / Math.max(1, positions.length);
}

/**
 * Solve cost at each trick of the deal, which is the number that decides whether
 * sampling can run on a phone: a sampling bot pays this once per sampled hand,
 * and the opening lead is the only decision that pays the full price.
 */
function timeByTrick(states: readonly DealState[]): number[] {
  const cost: number[] = [];

  for (let trick = 0; trick < 13; trick++) {
    const positions = states.flatMap((state) => {
      const completed = state.completedTricks.slice(0, trick);
      const played = completed.flatMap((one) => one.cards);
      const remaining = (seat: PlayerId): readonly Card[] =>
        played
          .filter((one) => one.by === seat)
          .reduce<readonly Card[]>((hand, one) => without(hand, one.card), state.initialHands![seat]);
      const hands: Pair<readonly Card[]> = [remaining(0), remaining(1)];
      const leader = state.completedTricks[trick]?.leader;
      return leader === undefined
        ? []
        : [{ hands, leader, strain: state.contract!.strain, trick: [] }];
    });

    const started = performance.now();
    for (const position of positions) {
      solve(position);
    }
    cost.push((performance.now() - started) / Math.max(1, positions.length));
  }

  return cost;
}

function run(deals: number): void {
  const playing = createProgress(deals, "playing");
  const states: DealState[] = [];
  for (let seed = 1; seed <= deals; seed++) {
    const state = playDeal(seed, (seed % 2) as PlayerId);
    if (state.contract !== null && !state.passedOut) {
      states.push(state);
    }
    playing(seed);
  }
  console.log(`${timeFullSolve(states).toFixed(2)} ms for one 13-trick solve`);
  const cost = timeByTrick(states);
  console.log(`  ms per solve, leading to trick 1..13:`);
  console.log(`  ${cost.map((ms) => ms.toFixed(2)).join("  ")}\n`);

  const started = performance.now();
  const analyzing = createProgress(deals, "analyzing");
  const reports: DealReport[] = [];
  for (let seed = 1; seed <= deals; seed++) {
    const report = reportFor(seed, (seed % 2) as PlayerId);
    if (report !== null) {
      reports.push(report);
    }
    const lost = reports.flatMap((one) => one.mistakes).reduce((total, one) => total + one.lost, 0);
    analyzing(seed, `${(lost / Math.max(1, reports.length)).toFixed(2)} tricks lost per deal`);
  }
  const elapsed = performance.now() - started;

  const lostBy = (report: DealReport, player: PlayerId): number =>
    report.mistakes.filter((mistake) => mistake.by === player).reduce((total, m) => total + m.lost, 0);

  const declarerLost = reports.map((report) => lostBy(report, report.declarer));
  const defenderLost = reports.map((report) => lostBy(report, opponentOf(report.declarer)));
  const shortOfPar = reports.map((report) => report.par[report.declarer] - report.actual[report.declarer]);
  const madeActual = reports.filter((report) => report.actual[report.declarer] >= report.needed).length;
  const madePar = reports.filter((report) => report.par[report.declarer] >= report.needed).length;

  console.log(`${reports.length} deals played to a contract, analyzed in ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`  tricks thrown away by declarer   ${mean(declarerLost).toFixed(2)} per deal`);
  console.log(`  tricks thrown away by defender   ${mean(defenderLost).toFixed(2)} per deal`);
  console.log(`  declarer's tricks below par      ${mean(shortOfPar).toFixed(2)} per deal`);
  console.log(`  contracts made                   ${percent(madeActual, reports.length)}`);
  console.log(`  contracts makeable at par        ${percent(madePar, reports.length)}`);

  // Over- and undertricks want to balance: a bidder that leaves points below
  // the line shows up as overtricks, one that overreaches as undertricks.
  const overtricks = reports.map((report) =>
    Math.max(0, report.actual[report.declarer] - report.needed),
  );
  const undertricks = reports.map((report) =>
    Math.max(0, report.needed - report.actual[report.declarer]),
  );
  console.log(`  overtricks / undertricks         ${mean(overtricks).toFixed(2)} / ${mean(undertricks).toFixed(2)}`);
  console.log(`  average level bid                ${mean(reports.map((report) => report.needed - 6)).toFixed(1)}`);

  const byTrick = new Map<number, number>();
  for (const report of reports) {
    for (const mistake of report.mistakes) {
      byTrick.set(mistake.trick, (byTrick.get(mistake.trick) ?? 0) + mistake.lost);
    }
  }
  console.log("\n  tricks lost, by which trick of the deal:");
  for (let trick = 1; trick <= 13; trick++) {
    const lost = byTrick.get(trick) ?? 0;
    console.log(`    ${String(trick).padStart(2)}  ${"#".repeat(Math.round(lost / 2))} ${lost.toFixed(0)}`);
  }

  const worst = reports
    .flatMap((report) => report.mistakes)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 10);
  console.log("\n  worst single cards:");
  for (const mistake of worst) {
    console.log(
      `    seed ${mistake.seed}, trick ${mistake.trick}, player ${mistake.by} played ` +
        `${mistake.card.rank}${mistake.card.suit} and lost ${mistake.lost}`,
    );
  }
}

function percent(count: number, total: number): string {
  return `${((100 * count) / Math.max(1, total)).toFixed(0)}%`;
}

const chosen = process.argv[3] ?? "heuristic";
makeBot = BOTS[chosen] ?? BOTS.heuristic!;
console.log(`Bot: ${chosen}\n`);
run(Number(process.argv[2] ?? 200));
