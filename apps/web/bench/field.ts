import {
  applyAction,
  createRng,
  duplicateScoreFor,
  fieldVulnerableFor,
  matchpointsOf,
  newRubber,
  startDeal,
} from "@hb/engine";
import type { Contract, DealState, Pair, PlayerId, Standing } from "@hb/engine";
import { DEFAULT_GAME_EQUITY } from "../src/bot/bidValue.js";
import { RUFF_PER_LEVEL } from "../src/bot/evaluate.js";
import type { BotTuning } from "../src/bot/heuristicBot.js";
import type { Objective } from "../src/bot/bidValue.js";
import { botForLevel } from "../src/bot/build.js";
import { levelFor } from "../src/bot/difficulty.js";
import { LATEST_RELEASE } from "../src/bot/release.js";
import type { BotRelease } from "../src/bot/release.js";
import { botTuningFor } from "../src/game/botTuning.js";
import { botActionFor } from "../src/game/botTurn.js";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
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
/**
 * The bidder that made the corpus on disk, written out rather than looked up.
 *
 * It was `releaseFor(CORPUS_VERSION)` until v3 was corrected in place: `drawCountsLive`
 * changes the draw, a bidder's draw decides its hands, and so reading the registry
 * would have stopped reconstructing the bot that actually generated these 15,081
 * entries — silently, with `compare`'s control arm drifting off the 50% it must hit by
 * construction and every margin beside it quietly wrong.
 *
 * **So this is the cost of folding a release back in, paid here.** A literal is not a
 * perfect preservation either — the bot calls the shared engine, the solver and
 * `evaluate.ts`'s calibration, so a refit still moves it, which is exactly why
 * `release.ts` says freezing a tuning does not preserve a release. It is the best
 * available, and it is honest about what it is: the configuration named, not a version
 * number that has since changed meaning.
 *
 * Replace it when the corpus is regenerated, which is the same moment the old boards
 * stop being offered.
 */
const CORPUS_TUNING: BotTuning = { defendingRuff: RUFF_PER_LEVEL, objective: "equity" };
const CORPUS_VERSION = 3;

function generatorTuning(
  release: BotRelease = { name: "the corpus bidder", tuning: CORPUS_TUNING, version: CORPUS_VERSION },
): ReturnType<typeof botTuningFor> {
  const level = levelFor("championship");
  const tuning = botTuningFor({
    // The shipped defaults, because the corpus has to be set by the computer
    // people actually meet rather than by a configuration nobody plays.
    disguise: true,
    format: "duplicate",
    gameEquity: DEFAULT_GAME_EQUITY,
    level,
    release,
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
    const vulnerable = fieldVulnerableFor(seed, 0);
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
  // Every seed: one is eight deals and about two minutes, so anything coarser leaves
  // a run that is working and a run that has wedged looking identical for half an hour.
  const progress = createProgress(seeds, "seeds", 1);
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
    // **Per board, not per stock.** `playBoard` deals the stock with seat 0 drawing
    // first, so its own scoring takes the starter-0 reading; a board dealt from the
    // other end hands its two seats the other way round, and writing one pair
    // against both is what once gave a person terms nobody else on that board had.
    const vulnerable = fieldVulnerableFor(seed, 0);
    for (const starter of [0, 1] as const) {
      const terms = fieldVulnerableFor(seed, starter);
      // **Distinct per board, in the order they are made.** Stamping a whole batch
      // with one timestamp leaves the selector's "oldest first" with nothing to sort
      // on, so play scatters across the pool instead of working through it — and a
      // pool played thin is a pool whose boards never gather a field.
      boards.push(
        `('f${seed}-${starter}', ${seed}, ${starter}, ${terms[0] ? 1 : 0}, ` +
          `${terms[1] ? 1 : 0}, ${LATEST_RELEASE.version}, 'championship', ` +
          `${now + index * 2 + starter})`,
      );
    }
    for (let at = 0; at < runs; at += 1) {
      const run = playBoard(seed, at, vulnerable);
      results.push(rowFor(`f${seed}-0`, run, 0, at, now + at));
      results.push(rowFor(`f${seed}-1`, run, 1, at, now + at));
    }
    // **Written out after every seed, not at the end.** A hundred seeds is nearly two
    // hours, and a run that dies at seed 99 having written nothing is two hours for
    // nothing — which is not hypothetical, since this has been killed mid-run more
    // than once. Rewriting both files each time costs milliseconds against the minute
    // a seed takes, and what is on disk is always a corpus that can be loaded.
    write(boards, results);
    progress(index + 1);
  }
  console.log(
    `\n  wrote ${outputPrefix()}-boards.sql (${boards.length} boards) and ` +
      `${outputPrefix()}-results.sql (${results.length} results)\n` +
      `\n  Apply them **separately and in this order** — a single file mixing the two\n` +
      `  fails on a foreign key, because \`wrangler d1 execute --file\` does not\n` +
      `  reliably apply statements in the order they are written:\n` +
      `\n    npx wrangler d1 execute honeymoon-bridge --local --file=${outputPrefix()}-boards.sql` +
      `\n    npx wrangler d1 execute honeymoon-bridge --local --file=${outputPrefix()}-results.sql\n` +
      `\n  Then number the pool **once**, after every part above is loaded — not once\n` +
      `  per part, which is what exhausted D1's daily row-read limit the first time:\n` +
      `\n    npx wrangler d1 execute honeymoon-bridge --local --file=${outputPrefix()}-number.sql\n`,
  );
}

const BOARD_COLUMNS =
  "id, seed, starter, vulnerable_0, vulnerable_1, bot_version, difficulty, created_at";

/**
 * Numbers every board in the pool by seed, which is the order they were generated in.
 *
 * Written as a statement to run rather than as a column in the insert, because a
 * batch cannot know how many boards came before it — and because doing it this way is
 * **idempotent**: it can be run after any load, or twice, and gives the same answer.
 * Both sides of a stock share a number, since a board is a stock.
 *
 * **It is its own file, and it used to be appended to every worker's boards file.**
 * Idempotent was the argument for that, and idempotent it is — it was also quadratic,
 * which nobody priced. The first version numbered each row with a correlated
 * `COUNT(DISTINCT seed) WHERE seed <= this one`, so the plan was a scan of the table
 * with a range scan of the seed index *per row*: about 2 million rows read over 1,998
 * boards, and it ran once per file against a growing table. Loading a 999-board corpus
 * in six parts therefore read about **5.05 million rows and exhausted D1's free daily
 * limit of 5 million** — measured afterwards at 5,032,772, which is how this was found.
 *
 * The window-function form does one pass over the distinct seeds and one index seek per
 * seed: roughly **5,000 rows** for the same answer, checked as identical on all 1,998
 * rows of the generated corpus. Run it **once, after every part is loaded** — it is
 * cheap now, but there is still no reason to do it six times.
 */
const NUMBER_BOARDS =
  "UPDATE field_boards SET number = s.n\n" +
  "  FROM (SELECT seed, ROW_NUMBER() OVER (ORDER BY seed) AS n\n" +
  "          FROM (SELECT DISTINCT seed FROM field_boards)) AS s\n" +
  " WHERE s.seed = field_boards.seed;\n";
const RESULT_COLUMNS =
  "id, board_id, played_at, account_id, opponent_account_id, generated, points, " +
  "declarer, contract_level, contract_strain, contract_doubling, tricks_0, tricks_1, " +
  // **On the result as well as on the board**, since a board records what generated
  // it and a result records what *played* it — and once people start filing results
  // those stop being the same question. See `0017_field_result_opposition`.
  "bot_version, difficulty";

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
  // The **net** from this board's seat. Storing the seat's own total instead cannot
  // rank defence at all: this engine scores the rubber way, so a defender is on nought
  // whether the contract scraped home or made an overtrick.
  const net = run.points[mine] - run.points[theirs];
  return (
    `('${boardId}-r${at}', '${boardId}', ${playedAt}, NULL, NULL, 1, ${net}, ` +
    `${declarer}, ${level}, ${strain}, ${doubling}, ${run.tricks[mine]}, ${run.tricks[theirs]}, ` +
    `${LATEST_RELEASE.version}, 'championship')`
  );
}

/**
 * `out=<name>` writes to `field-<name>-boards.sql` and `field-<name>-results.sql`.
 *
 * Because the only way to build a corpus of any size is to run several of these at
 * once — a seed is about a minute and the search is single-threaded, so one process
 * is a core's worth of a machine that has ten. Workers take disjoint `base` values so
 * their seeds cannot collide, and each needs somewhere of its own to write or the
 * last one to finish silently wins.
 */
function outputPrefix(): string {
  const arg = process.argv.find((one) => one.startsWith("out="));
  return arg === undefined ? "field" : `field-${arg.slice("out=".length)}`;
}

function write(boards: readonly string[], results: readonly string[]): void {
  const prefix = outputPrefix();
  writeFileSync(`${prefix}-boards.sql`, insertFor(BOARD_COLUMNS, "field_boards", boards));
  writeFileSync(`${prefix}-results.sql`, insertFor(RESULT_COLUMNS, "field_results", results));
  // Its own file so it is run once over the finished pool rather than once per worker
  // — see `NUMBER_BOARDS`, and the five million rows the old arrangement cost.
  writeFileSync(`${prefix}-number.sql`, NUMBER_BOARDS);
}

/**
 * How many rows go in one `INSERT`.
 *
 * It was one statement for the whole file, so nothing inside it could race anything
 * else inside it — which is true for a handful of seeds and **fails outright at a
 * hundred**: SQLite refuses a statement that long with `SQLITE_TOOBIG`, and a file of
 * 1,600 rows is well past it. Chunking keeps the property that actually matters, that
 * every row of a chunk lands or none does, and gives up only all-or-nothing across
 * the whole file, which nothing depends on.
 */
const ROWS_PER_INSERT = 400;

function insertFor(columns: string, table: string, rows: readonly string[]): string {
  const statements: string[] = [];
  for (let at = 0; at < rows.length; at += ROWS_PER_INSERT) {
    const chunk = rows.slice(at, at + ROWS_PER_INSERT);
    statements.push(`INSERT INTO ${table} (${columns}) VALUES\n${chunk.join(",\n")};\n`);
  }
  return statements.join("");
}

/**
 * Reads a corpus back out of the SQL the generator wrote.
 *
 * The files are this tool's own output and the shape is one `INSERT` with one tuple
 * a line, so a split is enough and no database has to be running. Reading D1 instead
 * would tie the bench to whatever happens to have been loaded, which is a worse
 * dependency for a measurement than a file on disk.
 */
function corpus(): ReadonlyMap<string, CorpusBoard> {
  const boards = new Map<string, CorpusBoard>();
  for (const file of readdirSync(".").filter((one) => /^field.*-boards\.sql$/.test(one))) {
    for (const row of tuples(readFileSync(file, "utf8"))) {
      const [id, seed, starter, vul0, vul1] = row;
      boards.set(unquote(id!), {
        entries: [],
        seed: Number(seed),
        starter: Number(starter) === 1 ? 1 : 0,
        vulnerable: [Number(vul0) === 1, Number(vul1) === 1],
      });
    }
  }
  for (const file of readdirSync(".").filter((one) => /^field.*-results\.sql$/.test(one))) {
    for (const row of tuples(readFileSync(file, "utf8"))) {
      const board = boards.get(unquote(row[1]!));
      const points = Number(row[6]);
      // A file still being written can end mid-line, and `Number` of a half-tuple is
      // `NaN` — which would not throw, it would quietly poison one board's field and
      // every percentage computed against it.
      if (board !== undefined && Number.isFinite(points)) {
        board.entries.push(points);
      }
    }
  }
  return boards;
}

interface CorpusBoard {
  readonly entries: number[];
  readonly seed: number;
  readonly starter: PlayerId;
  readonly vulnerable: Pair<boolean>;
}

function tuples(sql: string): string[][] {
  return sql
    .split("\n")
    .filter((line) => line.startsWith("('"))
    .map((line) => line.replace(/^\(|\),?;?$/g, "").split(", "));
}

function unquote(value: string): string {
  return value.replace(/^'|'$/g, "");
}

/**
 * Two bidders over the same boards, each ranked against the field already on them.
 *
 * **The most sensitive instrument in here, and the reason is the pairing.** Every
 * other bench fights the deal — `bench/rubber.ts` needs hundreds of rubbers to
 * separate two similar bidders because the cards are most of the variance. Here the
 * stock, the opposition and the field are identical for both sides and only the
 * bidder differs, so the deal cancels outright. That is duplication doing for a
 * measurement exactly what §1.8 does for a game.
 *
 * **And it calibrates itself.** The field was made by the bot at a known
 * configuration, so a bidder that plays like the corpus scores **50% by
 * construction**. There is no reference opponent to choose and no anchor to invent —
 * which matters, because `bench/rubber.ts` has twice been caught by a reference that
 * was quietly handicapping one side.
 *
 * What it cannot say: how a *person* would fare. It plays the bot in the player's
 * seat, and the field it ranks against is that bot's own — so it is an opponent model
 * of the corpus bidder, the same caveat `equity.ts` carries about its table.
 *
 *   npx vite-node bench/field.ts -- compare [boards] [objective=points]
 */
function compare(boards: number): void {
  const pool = [...corpus().entries()].filter(([, board]) => board.entries.length > 0);
  const wanted = pool.slice(0, boards);
  if (wanted.length === 0) {
    console.log("  no corpus on disk — run `generate` first\n");
    return;
  }
  // **`ruff` prices the defensive-ace discount, which the corpus predates.** Every
  // generated run was made before `defendingRuff` existed, so the field *is* the
  // uncorrected bidder — which makes A the thing that built it and B the correction,
  // both ranked against the same results on the same stocks.
  const ruff = process.argv.includes("ruff");
  // **`weight=W` prices the defending blend, and pairs with `ruff`.** The two interact:
  // the discount corrects the own-hand term, and the weight decides how much of that
  // term reaches the estimate at all. Measured alone at the shipped 0.75 the discount
  // was a null, because it carried a quarter weight — so the run worth making moves
  // both, which is what this flag is for.
  const weightArg = process.argv.find((one) => one.startsWith("weight="));
  const weight = weightArg === undefined ? null : Number(weightArg.slice("weight=".length));
  // **`dmargin=N` prices refusing the marginal doubles.** A double is chosen by
  // comparing two expected values computed from an estimate with a trick of error, so
  // the close calls are decided by that error — and the doubles taken are the ones it
  // erred optimistically on. This is the knob that declines them; see `DOUBLE_MARGIN`.
  const marginArg = process.argv.find((one) => one.startsWith("dmargin="));
  const dmargin = marginArg === undefined ? null : Number(marginArg.slice("dmargin=".length));
  // **`draw` prices v4's live-card draw, and this is the bench that decides it.**
  // `bench/rubber.ts` put it at 52.2% ± 2.8 over 320 rubbers — 0.8 standard errors,
  // nothing — while the same change is +0.078 ± 0.018 double-dummy tricks of hand
  // quality. A rubber is the wrong instrument for a draw: the deal is most of the
  // variance and a better hand mostly buys a contract that was going to be bid
  // anyway. Here the board cancels the deal, so what is left is the hand each
  // bidder built from the same stock.
  const draw = process.argv.includes("draw");
  const other = objectiveArg();
  const progress = createProgress(wanted.length, "boards", 10);
  const differences: number[] = [];
  let mineTotal = 0;
  let theirsTotal = 0;

  console.log(
    `${wanted.length} boards, corpus v${CORPUS_VERSION} at Championship\n` +
      (draw
        ? `  A  the bidder that made the corpus, valuing a growing hand against a full deck\n` +
          `  B  the same bidder, counting only the cards that can still appear\n`
        : dmargin !== null
        ? `  A  the bidder that made the corpus\n` +
          `  B  the same bidder, doubling only when it wins by ${dmargin}\n`
        : weight !== null
        ? `  A  the bidder that made the corpus — flat ace, their bid at 0.75\n` +
          `  B  the discount, with their bid at ${weight}\n`
        : ruff
        ? `  A  the bidder that made the corpus, counting a defensive ace flat\n` +
          `  B  the same bidder discounting it by how high they bid\n`
        : `  A  the corpus bidder, pricing a board in points (duplicate)\n` +
          `  B  the same bidder pricing in ${other}\n`),
  );

  wanted.forEach(([id, board], at) => {
    // A is the bidder that made the corpus: flat own-hand term, shipped weight.
    const mine = placeOf(
      board,
      draw || dmargin !== null
        ? generatorTuning()
        : ruff || weight !== null
          ? { ...generatorTuning(), defendingRuff: 0 }
          : { ...generatorTuning(), objective: "duplicate" as Objective },
    );
    const theirs =
      draw
        ? { ...generatorTuning(), drawCountsLive: true }
        : dmargin !== null
        ? { ...generatorTuning(), doubleMargin: dmargin }
        : weight !== null
        ? { ...generatorTuning(), theirBidWeight: weight }
        : ruff
          ? generatorTuning()
          : { ...generatorTuning(), objective: other };
    const theirsPlace = placeOf(board, theirs);
    mineTotal += mine;
    theirsTotal += theirsPlace;
    differences.push(mine - theirsPlace);
    progress(at + 1, `${id} ${mine.toFixed(0)}% / ${theirsPlace.toFixed(0)}%`);
  });

  const spread = standardError(differences);
  console.log(
    `\n  A  ${(mineTotal / wanted.length).toFixed(1)}%` +
      `\n  B  ${(theirsTotal / wanted.length).toFixed(1)}%` +
      `\n  difference  ${mean(differences) >= 0 ? "+" : ""}${mean(differences).toFixed(1)}` +
      ` ± ${spread.toFixed(1)} over ${wanted.length} boards\n` +
      `\n  50% is the bidder that made the corpus — anything above it is beating that.\n`,
  );
}

/** Plays one board with one tuning and returns where it placed, as a percentage. */
function placeOf(board: CorpusBoard, tuning: ReturnType<typeof botTuningFor>): number {
  const level = levelFor("championship");
  // **Seeded outside the corpus's own range, which matters more than it looks.**
  // Generation derives its runs as `seed ^ (run * 2 + 1)` and `seed ^ (run * 2 + 2)`
  // for eight runs, so 1 through 16 are *taken*. Seeding a bidder at `seed ^ 1` makes
  // it a byte-for-byte replay of corpus run 0 — so it ties with itself on every board
  // and is dragged toward 50% however it bids. Caught because the first run came back
  // at exactly 50.0%, which is the right reaction to a suspiciously round number.
  const bots: Pair<ReturnType<typeof botForLevel>> = [
    botForLevel({ level, rng: createRng(board.seed ^ 0x4001), tuning }),
    // The opposition is the corpus's own, whatever the seat under test is playing —
    // §1.8a's rule that a score says as much about who sat opposite as who made it.
    botForLevel({ level, rng: createRng(board.seed ^ 0x4002), tuning: generatorTuning() }),
  ];
  const standing: Standing = { rubber: newRubber(), vulnerable: board.vulnerable };

  let state: DealState = startDeal({ seed: board.seed, starter: board.starter });
  while (state.phase !== "complete") {
    const seat = state.toAct;
    state = applyAction(state, seat, botActionFor({ bot: bots[seat], seat, standing, state }));
  }
  const score = duplicateScoreFor(state, board.vulnerable);
  const net = score === null ? 0 : score.points[0] - score.points[1];
  // Two for every entry beaten, one for every tie — `matchpointsOf`'s own arithmetic,
  // reached through the engine so the bench and the game cannot disagree about it.
  return (
    matchpointsOf(
      net,
      board.entries.map((points) => ({ contract: null, kind: "computer", points, tricks: null, who: "" })),
    ) ?? 50
  );
}

function objectiveArg(): Objective {
  const arg = process.argv.find((one) => one.startsWith("objective="));
  const asked = arg === undefined ? "points" : arg.slice("objective=".length);
  return asked === "equity" || asked === "mirror" || asked === "duplicate" || asked === "field"
    ? asked
    : "points";
}

function standardError(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const average = mean(values);
  const variance =
    values.reduce((total, one) => total + (one - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

if (process.argv.includes("compare")) {
  compare(numberArg(1, 50));
} else if (process.argv.includes("generate")) {
  // The flag occupies the first positional slot, so the counts sit one along.
  generate(numberArg(1, 10), numberArg(2, 8));
} else {
  run(numberArg(0, 10), numberArg(1, 4));
}
