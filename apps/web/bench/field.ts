import { applyAction, createRng, duplicateScoreFor, newRubber, startDeal } from "@hb/engine";
import type { Contract, DealState, Pair, PlayerId, Standing } from "@hb/engine";
import { DEFAULT_GAME_EQUITY } from "../src/bot/bidValue.js";
import { botForLevel } from "../src/bot/build.js";
import { levelFor } from "../src/bot/difficulty.js";
import { LATEST_RELEASE } from "../src/bot/release.js";
import { botTuningFor } from "../src/game/botTuning.js";
import { botActionFor } from "../src/game/botTurn.js";
import { writeFileSync } from "node:fs";
import { createProgress } from "./progress.js";

/**
 * What solid play makes of a stock — and, first, whether that is one number.
 *
 * §1.8a scores a board against results already recorded on it, and the first of
 * those is generated rather than played: the computer plays the board against
 * itself at the top rung and the two seats' scores become the two streams'
 * opening results. That only works if the number is *the* number rather than one
 * of several the computer might have produced, because a run that happened to go
 * badly would sit permanently in the yardstick everybody is measured against.
 *
 * **Nothing here is random, and that is the point of the probe.** The engine
 * never calls `Math.random`, every bot is built around an injected `Rng`, and the
 * draw is deterministic anyway — `chooseTake` takes no `Rng` at all, so both hands
 * are identical on every run of a board. So the two things that could make runs
 * differ are the sampler's seed, which is derived here, and the bid search's
 * wall-clock budget, which is **pinned to its sample count** below. With both
 * fixed a board's entry is a pure function of its seed: reproducible on any
 * machine, and recomputable by anyone who wants to check it.
 *
 * What is left to measure is whether the bot's play *varies across derived seeds*
 * — whether one run is a fair account of the stock or an arbitrary path through
 * it. If the scores agree, an entry costs one run and the corpus is cheap. If
 * they scatter, an entry is a mean over several and the contract shown on screen
 * has to be one representative run rather than the entry itself.
 *
 *   npx vite-node bench/field.ts [boards] [runs] [base=N]
 */

/** `deadline` keeps the shipped 250ms budget, for what pinning the search costs. */
function pinned(): boolean {
  return !process.argv.includes("deadline");
}

/**
 * How many hands the bid search guesses at, which is the lever on how much runs
 * disagree — `bidsamples=N`, the shipped 25 unless asked.
 *
 * **Not time.** The search is already run to completion here, so giving it longer
 * buys nothing: what is left is its own sampling error. It estimates a contract's
 * tricks by guessing the hand it cannot see `searchSamples` times, so two runs
 * with different derived seeds guess different hands and can land on different
 * levels. More samples is a tighter estimate and so a steadier call; more *runs*
 * averages the same error away afterwards. Which of the two is cheaper is what
 * this flag is for.
 */
function bidSamples(): number | null {
  const arg = process.argv.find((one) => one.startsWith("bidsamples="));
  if (arg === undefined) {
    return null;
  }
  const asked = Number(arg.slice("bidsamples=".length));
  return Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : null;
}

/** The one place the shipped Championship bot is made reproducible. */
function generatorTuning(): ReturnType<typeof botTuningFor> {
  const level = levelFor("championship");
  const tuning = botTuningFor({
    // The shipped defaults, because the corpus has to be set by the computer
    // people actually meet rather than by a configuration nobody plays.
    disguise: true,
    format: "duplicate",
    gameEquity: DEFAULT_GAME_EQUITY,
    level,
    release: LATEST_RELEASE,
  });
  const samples = bidSamples();
  const searched = samples === null ? tuning : { ...tuning, searchSamples: samples };
  if (!pinned()) {
    return searched;
  }
  // An anytime search returns whatever it managed in the time, so the same board
  // generated on two machines would carry two different benchmarks. Removing the
  // deadline leaves the sample count, which is the same search run to completion.
  return { ...searched, searchBudgetMs: Number.MAX_SAFE_INTEGER };
}

/**
 * Vulnerability as the board prescribes it, by position rather than by player.
 *
 * A field board is played once, so there is no replay to resolve against — the
 * first-draw stream is seat 0 and the cycle is read against it. Stored with the
 * board in the corpus rather than derived at the point of play, so nothing can drift
 * it; keyed off the **seed** rather than off a position in a batch, so regenerating
 * a board gives it the same terms it had before.
 */
function vulnerableFor(seed: number): Pair<boolean> {
  const phase = seed % 4;
  return [phase === 1 || phase === 3, phase === 2 || phase === 3];
}

interface Run {
  readonly contract: Contract | null;
  readonly ms: number;
  /** Each seat's whole score for the deal, bonus included. Seat 0 holds the first-draw stream. */
  readonly points: Pair<number>;
  readonly tricks: Pair<number>;
}

function playBoard(seed: number, run: number, vulnerable: Pair<boolean>): Run {
  const tuning = generatorTuning();
  const level = levelFor("championship");
  // Derived rather than fresh: the run index is part of the board's identity, so
  // the same board at run 2 is the same deal on any machine and on any day.
  const bots: Pair<ReturnType<typeof botForLevel>> = [
    botForLevel({ level, rng: createRng(seed ^ (run * 2 + 1)), tuning }),
    botForLevel({ level, rng: createRng(seed ^ (run * 2 + 2)), tuning }),
  ];
  const standing: Standing = { rubber: newRubber(), vulnerable };
  const started = performance.now();

  let state: DealState = startDeal({ seed, starter: 0 as PlayerId });
  while (state.phase !== "complete") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat], seat, standing, state }));
  }

  const score = duplicateScoreFor(state, vulnerable);
  return {
    contract: state.contract,
    ms: performance.now() - started,
    points: score === null ? [0, 0] : score.points,
    tricks: state.tricksWon,
  };
}

function contractText(run: Run): string {
  if (run.contract === null) {
    return "passed out";
  }
  const { declarer, doubling, level, strain } = run.contract;
  const mark = doubling === "redoubled" ? "xx" : doubling === "doubled" ? "x" : "";
  const needed = level + 6;
  const made = run.tricks[declarer];
  const result = made >= needed ? `+${made - needed}` : `-${needed - made}`;
  return `${level}${strain}${mark} by ${declarer} ${result === "+0" ? "=" : result}`;
}

function distinct(values: readonly number[]): number[] {
  return [...new Set(values)].sort((one, two) => one - two);
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function spread(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function numberArg(index: number, fallback: number): number {
  const raw = process.argv[2 + index];
  const asked = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : fallback;
}

function baseArg(): number {
  const arg = process.argv.find((one) => one.startsWith("base="));
  const asked = arg === undefined ? Number.NaN : Number(arg.slice("base=".length));
  // Fixed rather than random, so two invocations probe the same boards and a
  // result that looks odd can be looked at again.
  return Number.isFinite(asked) ? Math.floor(asked) : 20_260_912;
}

/**
 * How far a *k*-run entry would sit from the entry the full run produced.
 *
 * This is the question rather than the spread: a board whose runs scatter is
 * still cheap to generate if three of them average to what twenty do. Reported as
 * the mean absolute error across every board and both streams, since a stream is
 * what carries an entry.
 */
function convergence(streams: readonly (readonly number[])[], runs: number): string[] {
  const lines: string[] = [];
  for (let k = 1; k <= runs; k += 1) {
    const errors = streams.map((values) => {
      const partial = mean(values.slice(0, k));
      return Math.abs(partial - mean(values));
    });
    lines.push(`    ${String(k).padStart(2)} runs  ${mean(errors).toFixed(1)} points from the full mean`);
  }
  return lines;
}

function run(boards: number, runs: number): void {
  const base = baseArg();
  const progress = createProgress(boards, "boards");
  const spreads: number[] = [];
  const perRun: number[] = [];
  /** One entry a stream: the score that stream got on each run. */
  const streams: number[][] = [];
  let identical = 0;
  let contractsAgreed = 0;

  console.log(
    `${boards} boards × ${runs} runs, ${LATEST_RELEASE.name} at Championship, ` +
      `bid search ${pinned() ? "run to completion" : "on its shipped 250ms deadline"} ` +
      `at ${bidSamples() ?? levelFor("championship").tuning.searchSamples} samples, base=${base}\n`,
  );

  for (let index = 0; index < boards; index += 1) {
    const seed = (base + index * 7919) >>> 0;
    const vulnerable = vulnerableFor(seed);
    const played = Array.from({ length: runs }, (_, at) => playBoard(seed, at, vulnerable));

    // Both seats, because a board is two entries and either can move on its own —
    // a contract going down two rather than three leaves declarer on nothing twice
    // while the defender's score changes by fifty.
    const first = played.map((one) => one.points[0]);
    const second = played.map((one) => one.points[1]);
    const contracts = new Set(played.map((one) => contractText(one)));
    const gap = Math.max(spread(first), spread(second));

    streams.push(first, second);
    spreads.push(gap);
    perRun.push(...played.map((one) => one.ms));
    if (gap === 0) {
      identical += 1;
    }
    if (contracts.size === 1) {
      contractsAgreed += 1;
    }

    const show = (values: readonly number[]): string =>
      distinct(values)
        .map((one) => (one > 0 ? `+${one}` : one))
        .join("/");
    console.log(
      `  board ${String(index).padStart(3)} seed ${String(seed).padStart(10)}  ` +
        `${show(first).padEnd(14)} ${show(second).padEnd(14)} ${[...contracts].join(" | ")}`,
    );
    progress(index + 1);
  }

  console.log(
    `\n  boards whose runs all scored the same: ${identical} of ${boards}` +
      `\n  boards whose runs all bid the same:    ${contractsAgreed} of ${boards}` +
      `\n  mean spread across runs:               ${mean(spreads).toFixed(0)} points` +
      `\n  widest spread on any board:            ${Math.max(...spreads)} points` +
      `\n  cost of a run:                         ${(mean(perRun) / 1000).toFixed(1)}s` +
      `\n  cost of 200 boards at one run each:    ${((mean(perRun) * 200) / 60_000).toFixed(0)} minutes` +
      `\n\n  how far a shorter entry lands from the full one:\n${convergence(streams, runs).join("\n")}\n`,
  );
}

/**
 * Writes a corpus rather than a read-out — §1.8a's boards and the field each opens
 * with.
 *
 * **One deal fills both of a stock's boards.** A board is a seed *and one side of
 * it*, and a single run scores both seats at once: whoever held the first-draw
 * stream and whoever held the second. So the run played with `starter: 0` gives the
 * starter-0 board seat 0's score and the starter-1 board seat 1's — no second deal,
 * and the two entries are the same deal seen from its two ends.
 *
 * **The second board's entry has to be turned round, and this is the trap.** A person
 * playing the starter-1 board sits in seat 0 and draws *second*, which is the seat
 * the generated deal called 1. So that entry's declarer, tricks and score are the
 * generated deal's read with the seats exchanged; stored as they came they would name
 * the wrong declarer and credit the wrong side on every second-stream board in the
 * corpus.
 */
function generate(seeds: number, runs: number): void {
  const base = baseArg();
  const progress = createProgress(seeds, "seeds");
  const level = levelFor("championship");
  const boards: string[] = [];
  const results: string[] = [];
  const now = Date.now();

  console.log(
    `${seeds} seeds × ${runs} runs → ${seeds * 2} boards, ` +
      `${LATEST_RELEASE.name} at Championship, base=${base}\n`,
  );

  for (let index = 0; index < seeds; index += 1) {
    const seed = (base + index * 7919) >>> 0;
    const vulnerable = vulnerableFor(seed);
    for (const starter of [0, 1] as const) {
      boards.push(
        `('f${seed}-${starter}', ${seed}, ${starter}, ${vulnerable[0] ? 1 : 0}, ` +
          `${vulnerable[1] ? 1 : 0}, ${LATEST_RELEASE.version}, 'championship', ${now})`,
      );
    }
    for (let at = 0; at < runs; at += 1) {
      const run = playBoard(seed, at, vulnerable);
      results.push(rowFor(`f${seed}-0`, run, 0, at, now + at));
      results.push(rowFor(`f${seed}-1`, run, 1, at, now + at));
    }
    progress(index + 1);
  }

  writeFileSync("field-boards.sql", insertFor(BOARD_COLUMNS, "field_boards", boards));
  writeFileSync("field-results.sql", insertFor(RESULT_COLUMNS, "field_results", results));
  console.log(
    `\n  wrote field-boards.sql (${boards.length} boards) and ` +
      `field-results.sql (${results.length} results)\n` +
      `\n  Apply them **separately and in this order** — a single file mixing the two\n` +
      `  fails on a foreign key, because \`wrangler d1 execute --file\` does not\n` +
      `  reliably apply statements in the order they are written:\n` +
      `\n    npx wrangler d1 execute honeymoon-bridge --local --file=field-boards.sql` +
      `\n    npx wrangler d1 execute honeymoon-bridge --local --file=field-results.sql\n`,
  );
}

const BOARD_COLUMNS =
  "id, seed, starter, vulnerable_0, vulnerable_1, bot_version, difficulty, created_at";
const RESULT_COLUMNS =
  "id, board_id, played_at, account_id, opponent_account_id, generated, points, " +
  "declarer, contract_level, contract_strain, contract_doubling, tricks_0, tricks_1";

/**
 * One result row, read from the side of the stock this board is.
 *
 * The id is derived from the board and the run index rather than from the clock, so
 * regenerating a seed collides on the primary key instead of quietly adding a second
 * copy of every entry. `playedAt` still comes from the clock and still orders the
 * runs, which is what the retirement rule reads.
 */
function rowFor(boardId: string, run: Run, starter: 0 | 1, at: number, playedAt: number): string {
  // The starter-1 board is played from the seat the generated deal called 1, so
  // everything seat-indexed is read the other way round for it.
  const mine = starter === 1 ? 1 : 0;
  const theirs = starter === 1 ? 0 : 1;
  const contract = run.contract;
  const declarer = contract === null ? "NULL" : contract.declarer === mine ? 0 : 1;
  const level = contract === null ? "NULL" : contract.level;
  const strain = contract === null ? "NULL" : `'${contract.strain}'`;
  const doubling = contract === null ? "NULL" : `'${contract.doubling}'`;
  return (
    `('${boardId}-r${at}', '${boardId}', ${playedAt}, NULL, NULL, 1, ${run.points[mine]}, ` +
    `${declarer}, ${level}, ${strain}, ${doubling}, ${run.tricks[mine]}, ${run.tricks[theirs]})`
  );
}

function insertFor(columns: string, table: string, rows: readonly string[]): string {
  // One statement, so nothing inside a file can race anything else inside it.
  return `INSERT INTO ${table} (${columns}) VALUES\n${rows.join(",\n")};\n`;
}

if (process.argv.includes("generate")) {
  // The flag occupies the first positional slot, so the counts sit one along.
  generate(numberArg(1, 10), numberArg(2, 8));
} else {
  run(numberArg(0, 10), numberArg(1, 4));
}
