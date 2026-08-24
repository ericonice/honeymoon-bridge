import {
  applyDealScore,
  BASE_RULES,
  createRng,
  opponentOf,
  scoreDeal,
  sortHand,
  STRAINS,
  totalScore,
} from "@hb/engine";
import type {
  AuctionEntry,
  Call,
  Card,
  CompletedTrick,
  Contract,
  DealRules,
  Pair,
  PlayerId,
  PlayerView,
  RubberState,
  Strain,
} from "@hb/engine";
import { readFileSync } from "node:fs";
import { estimatedTricks, highCardPoints } from "../src/bot/evaluate.js";
import { DISGUISE_CREDIT_ON, createHeuristicBot } from "../src/bot/heuristicBot.js";
import { loveAll } from "../src/game/botTurn.js";
import type { Standing } from "../src/bot/types.js";
import { solve, tricksAfter } from "../src/bot/solver.js";

/**
 * The same par analysis `bench/par.ts` runs, against deals a person actually
 * played rather than deals the bot played against itself.
 *
 * `handLog.ts` logs both hands as dealt, the auction and every trick; this is
 * the pass that was the reason for logging them. Seat 0 is the person and seat 1
 * is the computer in every robot game, so every number here is reported per seat
 * — a self-play bench cannot tell those apart and this is the only thing that
 * can say whether the bot is losing and to what.
 *
 * Reported in the currency the game is settled in — how far each deal moved the
 * rubber standing it was bid at. This file used to score every deal at love all
 * because the log carried no standing; `handLog.ts` records one now, and the
 * difference is not a refinement. The same 238 deals read +6 a deal at love all
 * and +63 at the score they were played at, which is how a bot losing eight
 * rubbers in nine could look level here for months.
 *
 * Reported per bot version, never pooled: two versions in one number is two
 * opponents measured as one, which is the whole reason `bot/release.ts` exists.
 * Note that the version is only the coarse axis — strength, boldness and the
 * disguise change the play too, and the shipped boldness changed with v2 — so each
 * block prints its own configuration census when it holds more than one.
 *
 *   npx vite-node bench/hands.ts <path to the logged JSON> [v=N]
 */

const HUMAN: PlayerId = 0;
const BOT: PlayerId = 1;

interface LoggedDeal {
  readonly auction: readonly AuctionEntry[];
  readonly completedTricks: readonly CompletedTrick[];
  readonly contract: Contract;
  readonly initialHands: Pair<readonly Card[]>;
  /** Absent from a deal logged before the house rules existed, which means the base game. */
  readonly rules?: DealRules;
  /**
   * The rubber and vulnerability the deal was bid at.
   *
   * Absent from a deal logged before `handLog.ts` recorded it, which is why
   * every number derived from it counts its own deals rather than trusting the
   * block's total.
   */
  readonly standing?: { readonly rubber: RubberState; readonly vulnerable: Pair<boolean> };
  readonly starter?: PlayerId;
  readonly tricksWon: Pair<number>;
}

interface LoggedHand {
  readonly boldness: string;
  readonly botVersion: number | null;
  readonly deal: LoggedDeal;
  readonly disguise: boolean;
  readonly playedAt: number;
  readonly strength: string;
}

interface Mistake {
  readonly by: PlayerId;
  readonly card: Card;
  readonly index: number;
  readonly lost: number;
  readonly trick: number;
}

interface Report {
  readonly actual: Pair<number>;
  /** Double-dummy tricks for each seat declaring in its own best strain. */
  readonly best: Pair<{ readonly strain: Strain; readonly tricks: number }>;
  readonly contract: Contract;
  /** What the bot's own evaluation said the contract strain was worth to it. */
  readonly estimate: number;
  readonly hcp: Pair<number>;
  readonly index: number;
  readonly mistakes: readonly Mistake[];
  /**
   * How far the rubber standing moved, the person's way — the currency the game
   * is actually settled in.
   *
   * Null for a deal logged before the standing was recorded. This is the figure
   * to read: measured at love all the same 238 deals come out +6 a deal, and at
   * the score they were played at they come out +63, because a part-score to
   * protect, a game to stretch for and an opponent who is vulnerable are the
   * whole of what a bidder is for. A love-all figure marks it on the one part of
   * its job it does not do.
   */
  readonly moved: number | null;
  readonly needed: number;
  readonly par: Pair<number>;
  /** The same deal at love all, kept only so the gap to `moved` stays visible. */
  readonly score: Pair<number>;
  readonly vulnerable: Pair<boolean> | null;
}

function without(hand: readonly Card[], card: Card): Card[] {
  return hand.filter((held) => held.rank !== card.rank || held.suit !== card.suit);
}

/** Replays the deal card by card; what each card cost its own side against perfect play. */
function mistakesIn(deal: LoggedDeal, index: number): Mistake[] {
  const strain = deal.contract.strain;
  const mistakes: Mistake[] = [];
  let held: Pair<readonly Card[]> = [deal.initialHands[0], deal.initialHands[1]];

  deal.completedTricks.forEach((trick, trickIndex) => {
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
        mistakes.push({ by: move.by, card: move.card, index, lost: before - after, trick: trickIndex + 1 });
      }
      played = [...played, move.card];
      held = move.by === 0 ? [without(held[0], move.card), held[1]] : [held[0], without(held[1], move.card)];
    }
  });

  return mistakes;
}

/**
 * How far the standing moved, the person's way, on the deal as it was played.
 *
 * Nothing here has its own idea of scoring, for the same reason `bidValue.ts`
 * does not: the engine's `scoreDeal` and `applyDealScore` already know about
 * game bonuses, the 500 and 700, doubled vulnerable penalties and honors, and a
 * bench with a private copy of those would drift from the rules the deal was
 * settled by. A difference rather than a total, because conceding 100 to stop
 * them scoring 500 is a good night's work and a total cannot say so.
 */
function movedFor(deal: LoggedDeal, hands: Pair<readonly Card[]>): number | null {
  const standing = deal.standing;
  if (standing === undefined) {
    return null;
  }
  const score = scoreDeal({ contract: deal.contract, hands, tricksWon: deal.tricksWon }, standing.vulnerable);
  const after = totalScore(applyDealScore(standing.rubber, score));
  const before = totalScore(standing.rubber);
  return after[HUMAN] - before[HUMAN] - (after[BOT] - before[BOT]);
}

function ddTricks(hands: Pair<readonly Card[]>, declarer: PlayerId, strain: Strain): number {
  return solve({ hands, leader: opponentOf(declarer), strain, trick: [] }).tricks[declarer];
}

function bestStrainFor(hands: Pair<readonly Card[]>, declarer: PlayerId): { strain: Strain; tricks: number } {
  let best = { strain: STRAINS[0]!, tricks: -1 };
  for (const strain of STRAINS) {
    const tricks = ddTricks(hands, declarer, strain);
    if (tricks > best.tricks) {
      best = { strain, tricks };
    }
  }
  return best;
}

function reportFor(hand: LoggedHand, index: number): Report {
  const deal = hand.deal;
  const hands: Pair<readonly Card[]> = [deal.initialHands[0], deal.initialHands[1]];
  const declarer = deal.contract.declarer;
  const par = solve({
    hands,
    leader: opponentOf(declarer),
    strain: deal.contract.strain,
    trick: [],
  }).tricks;
  const score = scoreDeal({ contract: deal.contract, hands, tricksWon: deal.tricksWon }, [false, false]);

  return {
    actual: deal.tricksWon,
    best: [bestStrainFor(hands, 0), bestStrainFor(hands, 1)],
    contract: deal.contract,
    estimate: estimatedTricks(hands[declarer], deal.contract.strain),
    hcp: [highCardPoints(hands[0]), highCardPoints(hands[1])],
    index,
    mistakes: mistakesIn(deal, index),
    moved: movedFor(deal, hands),
    needed: deal.contract.level + 6,
    par,
    score: [score.aboveLine[0] + score.belowLine[0], score.aboveLine[1] + score.belowLine[1]],
    vulnerable: deal.standing?.vulnerable ?? null,
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Standard error of the mean, so a difference between two seats can be read. */
function stderr(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const average = mean(values);
  const variance = sum(values.map((value) => (value - average) ** 2)) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function percent(count: number, total: number): string {
  return `${((100 * count) / Math.max(1, total)).toFixed(0)}%`;
}

/** Wide enough for the longest label in here, so no row runs into its own number. */
function pad(label: string): string {
  return label.padEnd(42);
}

function lostBy(report: Report, seat: PlayerId): number {
  return report.mistakes.filter((mistake) => mistake.by === seat).reduce((total, one) => total + one.lost, 0);
}

function describe(contract: Contract): string {
  const doubling = contract.doubling === "none" ? "" : contract.doubling === "doubled" ? "x" : "xx";
  return `${contract.level}${contract.strain}${doubling}`;
}

function auctionOf(deal: LoggedDeal): string {
  return deal.auction
    .map((entry) => {
      const call = entry.call;
      const said =
        call.type === "bid"
          ? `${call.bid.level}${call.bid.strain}`
          : call.type === "pass"
            ? "pass"
            : call.type === "double"
              ? "x"
              : "xx";
      return `${entry.by === HUMAN ? "H" : "B"}:${said}`;
    })
    .join(" ");
}

/** The score the deal was bid at, or love all for one logged before that was recorded. */
function standingFor(hand: LoggedHand): Standing {
  const standing = hand.deal.standing;
  return standing === undefined ? loveAll() : { rubber: standing.rubber, vulnerable: standing.vulnerable };
}

/**
 * The bidder as it stands now, asked what it would say at each point in a
 * recorded auction where it actually said something.
 *
 * This is the regression check the logging was for, and it is a different
 * instrument from `bench/rubber.ts` rather than a smaller one. The rubber bench
 * fits against a reference that bids the highest contract it thinks it can make
 * and therefore overclaims systematically, so it rewards distrusting the other
 * seat. These auctions are against a person bidding soundly. A change that helps
 * on both is a change worth having; one that helps only on the bench is fitted to
 * an opponent nobody plays.
 *
 * Replayed at the standing the deal was really bid at, which the log records
 * now. It used to be love all of necessity, and that was the single most
 * valuable thing missing from it: `bidValue.ts` prices every call against the
 * score, so a call taken with a game at stake and replayed at love all is a
 * different question with the same auction in front of it. A deal logged before
 * the standing was falls back to love all, and says so.
 */
function replayCall(hand: LoggedHand, before: number): Call | null {
  const deal = hand.deal;
  const entry = deal.auction[before];
  if (entry === undefined || entry.by !== BOT) {
    return null;
  }
  const view: PlayerView = {
    auction: deal.auction.slice(0, before),
    claim: null,
    completedTricks: [],
    contract: null,
    currentTrick: [],
    discardTop: null,
    drawTurns: [],
    hand: sortHand(deal.initialHands[BOT]),
    handSizes: [13, 13],
    me: BOT,
    opponent: HUMAN,
    passedOut: false,
    pending: null,
    phase: "auction",
    revealedHand: null,
    rules: deal.rules ?? BASE_RULES,
    starter: deal.starter ?? HUMAN,
    stockRemaining: 0,
    toAct: BOT,
    tricksWon: [0, 0],
    trickLeader: HUMAN,
  };
  // Mirrors `equityFor` in `localSession.ts`, so the replay prices a game the way
  // the run being replayed did.
  const gameEquity = hand.boldness === "bold" ? 550 : hand.boldness === "cautious" ? 250 : 400;
  const bot = createHeuristicBot(createRng(1), {
    disguiseCredit: hand.disguise ? DISGUISE_CREDIT_ON : 0,
    gameEquity,
  });
  // The bot's own discards, which the sampler needs to rule out cards it watched
  // itself bury. `initialHands` is what the draw produced, so the discards are
  // whatever the deal held that this seat neither kept nor was ever dealt — not
  // recoverable from the log, so an empty list here means the replayed bidder
  // guesses from a wider pool than the live one did.
  return bot.chooseCall(view, standingFor(hand), []);
}

function saidAs(call: Call): string {
  return call.type === "bid"
    ? `${call.bid.level}${call.bid.strain}`
    : call.type === "pass"
      ? "pass"
      : call.type === "double"
        ? "x"
        : "xx";
}

function seatSection(reports: readonly Report[], label: string, seat: PlayerId): void {
  const declared = reports.filter((report) => report.contract.declarer === seat);
  const defended = reports.filter((report) => report.contract.declarer !== seat);
  const thrown = reports.map((report) => lostBy(report, seat));
  const asDeclarer = declared.map((report) => lostBy(report, seat));
  const asDefender = defended.map((report) => lostBy(report, seat));

  console.log(`\n${label}`);
  console.log(`  ${pad("tricks thrown away per deal")}${mean(thrown).toFixed(2)} ± ${stderr(thrown).toFixed(2)}`);
  console.log(`  ${pad("  as declarer")}${mean(asDeclarer).toFixed(2)}  (${declared.length} deals)`);
  console.log(`  ${pad("  as defender")}${mean(asDefender).toFixed(2)}  (${defended.length} deals)`);

  const made = declared.filter((report) => report.actual[seat] >= report.needed).length;
  const makeable = declared.filter((report) => report.par[seat] >= report.needed).length;
  console.log(`  ${pad("contracts declared")}${declared.length}`);
  console.log(`  ${pad("  made")}${percent(made, declared.length)}`);
  console.log(`  ${pad("  makeable at par")}${percent(makeable, declared.length)}`);
  const shortfall = declared.map((report) => report.needed - report.par[seat]);
  console.log(
    `  ${pad("  level bid, over what par allows")}${mean(shortfall).toFixed(2)}  ` +
      `(bid ${mean(declared.map((report) => report.needed - 6)).toFixed(1)}, ` +
      `par allows ${mean(declared.map((report) => report.par[seat] - 6)).toFixed(1)})`,
  );

  // What the seat could have declared, from the hand it drew, in its best strain.
  const potential = reports.map((report) => report.best[seat].tricks);
  console.log(`  ${pad("best-strain double-dummy tricks")}${mean(potential).toFixed(2)}`);
  console.log(`  ${pad("high-card points drawn")}${mean(reports.map((report) => report.hcp[seat])).toFixed(1)}`);
}

/**
 * The whole file, indexed by its own stable deal number.
 *
 * Every `Report` carries the index it was built from, and several sections look a
 * deal up by it — so a subset of reports must not be indexed positionally. That
 * was fine while there was one report over the whole file and became a bug the
 * moment it was split per bot version.
 */
interface Corpus {
  readonly byIndex: ReadonlyMap<number, Report>;
  readonly played: readonly LoggedHand[];
}

/**
 * How this deal was configured. Any of these changes the play, so a block holding
 * more than one is not measuring a single opponent.
 *
 * The house rules are in here rather than being a separate axis because they are
 * the same kind of fact and the same failure if pooled — a deal where a discard
 * could be taken is a different game from one where it could not, and averaging
 * the two reports a number describing neither.
 */
function configOf(hand: LoggedHand): string {
  const rules = hand.deal.rules?.openDiscard === true ? ", open discard" : "";
  return `v${hand.botVersion ?? "?"}, ${hand.strength}, ${hand.boldness}, disguise ${hand.disguise ? "on" : "off"}${rules}`;
}

function census(hands: readonly LoggedHand[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const hand of hands) {
    const key = configOf(hand);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function assess(label: string, reports: readonly Report[], corpus: Corpus): void {
  const { byIndex, played } = corpus;
  console.log(`\n${"=".repeat(78)}\n${label}\n${"=".repeat(78)}`);

  const settings = census(reports.map((report) => played[report.index]!));
  if (settings.size > 1) {
    // The version is the coarse axis, but strength, boldness and the disguise all
    // change the opponent too — and the shipped boldness changed with v2, so a
    // version's deals are not automatically one opponent.
    console.log("  more than one configuration in here, so these numbers pool:");
    for (const [key, count] of settings) {
      console.log(`    ${count} × ${key}`);
    }
  }

  const declaredBy = (seat: PlayerId) => reports.filter((report) => report.contract.declarer === seat).length;
  console.log(`\n  ${pad("declared by person / computer")}${declaredBy(HUMAN)} / ${declaredBy(BOT)}`);

  // Two figures for the same deals, deliberately side by side. The first is what
  // the deal was worth; the second is what this bench used to report on its own,
  // and the gap between them is the reason it could not see a bot losing eight
  // rubbers in nine. Do not quote the love-all line as a result.
  const scored = reports.filter((report) => report.moved !== null);
  const movedHuman = scored.map((report) => report.moved!);
  if (scored.length > 0) {
    console.log(
      `  ${pad("standing moved per deal, person's way")}${mean(movedHuman).toFixed(0)} ± ${stderr(movedHuman).toFixed(0)}` +
        `   (at the score each deal was played at)`,
    );
    const sameDealsAtLoveAll = scored.map((report) => report.score[HUMAN] - report.score[BOT]);
    console.log(
      `  ${pad("  the same deals at love all")}${mean(sameDealsAtLoveAll).toFixed(0)} ± ${stderr(sameDealsAtLoveAll).toFixed(0)}` +
        `   (what this line used to say)`,
    );
  }
  if (scored.length < reports.length) {
    console.log(
      `  ${pad("  logged before the standing was")}${reports.length - scored.length} deals, love all only`,
    );
  }

  const netHuman = reports.map((report) => report.score[HUMAN] - report.score[BOT]);
  console.log(
    `  ${pad("deals scored to each, love all")}${reports.filter((one) => one.score[HUMAN] > one.score[BOT]).length} / ` +
      `${reports.filter((one) => one.score[BOT] > one.score[HUMAN]).length}`,
  );

  seatSection(reports, "The person (seat 0)", HUMAN);
  seatSection(reports, "The computer (seat 1)", BOT);

  // Both seats draw thirteen turns from the same stock, so the hand each ends
  // up with is the one thing that measures the draw phase from a played deal.
  const handGap = reports.map((report) => report.best[HUMAN].tricks - report.best[BOT].tricks);
  const hcpGap = reports.map((report) => report.hcp[HUMAN] - report.hcp[BOT]);
  console.log(
    `\n  ${pad("hand drawn, person minus computer")}${mean(handGap).toFixed(2)} ± ${stderr(handGap).toFixed(2)} best-strain tricks, ` +
      `${mean(hcpGap).toFixed(1)} ± ${stderr(hcpGap).toFixed(1)} high-card points`,
  );

  console.log("\nWhere the points go, person's way, at the score each deal was played at");
  const bucket = (label: string, chosen: readonly Report[]): void => {
    const net = chosen.filter((report) => report.moved !== null).map((report) => report.moved!);
    if (net.length === 0) {
      console.log(`  ${pad(label)}—`);
      return;
    }
    console.log(
      `  ${pad(label)}${String(net.length).padStart(3)} deals   ` +
        `${sum(net) >= 0 ? "+" : ""}${sum(net)} total   ${mean(net).toFixed(0)} ± ${stderr(net).toFixed(0)} per deal`,
    );
  };
  const doubled = (report: Report): boolean => report.contract.doubling !== "none";
  bucket("computer declared, doubled", reports.filter((one) => one.contract.declarer === BOT && doubled(one)));
  bucket("computer declared, undoubled", reports.filter((one) => one.contract.declarer === BOT && !doubled(one)));
  bucket("person declared, doubled", reports.filter((one) => one.contract.declarer === HUMAN && doubled(one)));
  bucket("person declared, undoubled", reports.filter((one) => one.contract.declarer === HUMAN && !doubled(one)));

  /**
   * The cut that found the thing a love-all bench cannot see.
   *
   * Vulnerability is not a modifier on a deal, it is a different game: a
   * vulnerable opponent's game contract finishes a rubber and takes its bonus,
   * so letting one through costs several times what the same contract costs at
   * love all. Split by who declared as well, because the two answers point
   * opposite ways — the bot is ahead on the deals it declares and a long way
   * behind on the ones it lets the other seat buy, and one pooled number hides
   * both.
   */
  const vul = (report: Report, seat: PlayerId): boolean => report.vulnerable?.[seat] === true;
  if (scored.length > 0) {
    console.log("\nWho was vulnerable, and who bought the contract");
    bucket("neither vulnerable", reports.filter((one) => !vul(one, HUMAN) && !vul(one, BOT)));
    bucket("only the person vulnerable", reports.filter((one) => vul(one, HUMAN) && !vul(one, BOT)));
    bucket("only the computer vulnerable", reports.filter((one) => !vul(one, HUMAN) && vul(one, BOT)));
    bucket("both vulnerable", reports.filter((one) => vul(one, HUMAN) && vul(one, BOT)));
    bucket(
      "person vulnerable, person declared",
      reports.filter((one) => vul(one, HUMAN) && one.contract.declarer === HUMAN),
    );
    bucket(
      "computer vulnerable, computer declared",
      reports.filter((one) => vul(one, BOT) && one.contract.declarer === BOT),
    );
    bucket(
      "a part-score was standing",
      reports.filter((one) => {
        const part = played[one.index]!.deal.standing?.rubber.partScore;
        return part !== undefined && (part[HUMAN] > 0 || part[BOT] > 0);
      }),
    );
  }

  // A contract in a strain the hand is not its best in is the bidder's own
  // choice, so it separates a misvalued hand from an auction it was pushed up.
  const botDeclared = reports.filter((one) => one.contract.declarer === BOT);
  const offStrain = botDeclared.filter((one) => one.contract.strain !== one.best[BOT].strain);
  console.log(
    `\n  ${pad("computer's contracts off its best strain")}${offStrain.length}/${botDeclared.length}, ` +
      `costing ${mean(offStrain.map((one) => one.best[BOT].tricks - one.par[BOT])).toFixed(1)} tricks against its own best`,
  );
  const hopeless = botDeclared.filter((one) => one.needed - one.par[BOT] >= 3);
  console.log(`  ${pad("  of which down 3 or more at par")}${hopeless.length}`);
  console.log(
    `  ${pad("computer's contracts in no-trump")}${botDeclared.filter((one) => one.contract.strain === "NT").length}` +
      `, of which doubled ${botDeclared.filter((one) => one.contract.strain === "NT" && doubled(one)).length}`,
  );

  // What the bidder believed about the hand it was bidding, against what the
  // hand was worth. A sacrifice priced correctly off a wrong estimate is still
  // a disaster, and this is what separates the two.
  const overestimate = botDeclared.map((report) => report.estimate - report.par[BOT]);
  console.log(
    `\n  ${pad("computer's own trick estimate, vs par")}${mean(overestimate) >= 0 ? "+" : ""}${mean(overestimate).toFixed(2)} tricks ` +
      `(estimated ${mean(botDeclared.map((one) => one.estimate)).toFixed(1)}, par ${mean(botDeclared.map((one) => one.par[BOT])).toFixed(1)})`,
  );
  console.log("\n  every contract the computer was doubled in");
  for (const report of botDeclared.filter(doubled)) {
    console.log(
      `    deal ${String(report.index + 1).padStart(2)}  ${describe(report.contract).padEnd(7)}  ` +
        `estimated ${report.estimate.toFixed(1)}  par ${report.par[BOT]}  took ${report.actual[BOT]}  ` +
        `needed ${report.needed}  best was ${report.best[BOT].tricks}${report.best[BOT].strain}   ` +
        `${auctionOf(played[report.index]!.deal)}`,
    );
  }

  console.log("\nThe computer's worst single cards");
  const worst = reports
    .flatMap((report) => report.mistakes)
    .filter((mistake) => mistake.by === BOT)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 12);
  for (const mistake of worst) {
    const report = byIndex.get(mistake.index)!;
    console.log(
      `  deal ${String(mistake.index + 1).padStart(2)}  ${describe(report.contract)} by ` +
        `${report.contract.declarer === BOT ? "computer" : "person"}  trick ${String(mistake.trick).padStart(2)}  ` +
        `played ${mistake.card.rank}${mistake.card.suit}, lost ${mistake.lost}`,
    );
  }

  console.log("\nEvery deal");
  console.log("  #   contract     by  par  got  need   H thrown  B thrown   H best  B best   auction");
  for (const report of reports) {
    const declarer = report.contract.declarer;
    console.log(
      `  ${String(report.index + 1).padStart(2)}  ${describe(report.contract).padEnd(11)}  ` +
        `${declarer === BOT ? "B" : "H"}   ${String(report.par[declarer]).padStart(2)}   ` +
        `${String(report.actual[declarer]).padStart(2)}   ${String(report.needed).padStart(2)}    ` +
        `${lostBy(report, HUMAN).toFixed(0).padStart(6)}    ${lostBy(report, BOT).toFixed(0).padStart(6)}   ` +
        `${report.best[HUMAN].tricks}${report.best[HUMAN].strain}     ${report.best[BOT].tricks}${report.best[BOT].strain}    ` +
        `${auctionOf(played[report.index]!.deal)}`,
    );
  }
}

/**
 * What today's bidder would say at every call the recorded one actually made.
 *
 * Deliberately *not* split by the version that played the deal. Every replay here
 * runs the bidder as it stands right now, so the logged version says who bid at
 * the time and has no bearing on the answer — a v1 auction is just as good a
 * position to re-ask as a v2 one, and the v1 deals are the more interesting ones
 * precisely because that is where the known disasters are.
 */
function replaySection(corpus: Corpus): void {
  const { byIndex, played } = corpus;
  const reports = [...byIndex.values()];

  console.log(`\n${"=".repeat(78)}\nWhat the bidder would say now, at every call it actually made\n${"=".repeat(78)}`);
  let same = 0;
  let changed = 0;
  const changesOn = new Map<number, string[]>();
  played.forEach((hand, index) => {
    // Stops at the first call that differs. Everything after it in the recorded
    // auction is a position that would no longer arise, so asking about it
    // reports a decision the bot will never face — which read as extra changes
    // and was just the same divergence counted again.
    for (let position = 0; position < hand.deal.auction.length; position++) {
      const entry = hand.deal.auction[position]!;
      if (entry.by !== BOT) {
        continue;
      }
      const now = replayCall(hand, position);
      if (now === null) {
        continue;
      }
      const was = saidAs(entry.call);
      const is = saidAs(now);
      if (was !== is) {
        changed += 1;
        changesOn.set(index, [`${was} → ${is}`]);
        break;
      }
      same += 1;
    }
  });
  console.log(`  ${pad("calls unchanged / changed")}${same} / ${changed}`);

  const wrecked = reports.filter(
    (one) => one.contract.declarer === BOT && one.contract.doubling !== "none",
  );
  const wreckedIndices = new Set(wrecked.map((one) => one.index));
  console.log(`\n  the ${wrecked.length} contracts the computer was doubled in, replayed`);
  for (const report of wrecked) {
    const changes = changesOn.get(report.index);
    console.log(
      `    deal ${String(report.index + 1).padStart(2)}  v${played[report.index]!.botVersion ?? "?"}  ` +
        `${describe(report.contract).padEnd(7)} par ${String(report.par[BOT]).padStart(2)}, ` +
        `needed ${report.needed}   ` +
        `${changes === undefined ? "unchanged — still bids it" : changes.join(", ")}`,
    );
  }
  const otherChanges = [...changesOn.entries()].filter(([index]) => !wreckedIndices.has(index));
  console.log(`\n  changes on the other ${otherChanges.length} deals`);
  for (const [index, changes] of otherChanges) {
    const report = byIndex.get(index)!;
    console.log(
      `    deal ${String(index + 1).padStart(2)}  v${played[index]!.botVersion ?? "?"}  ` +
        `${describe(report.contract).padEnd(7)} ` +
        `par ${String(report.par[report.contract.declarer]).padStart(2)}, needed ${report.needed}   ${changes.join(", ")}`,
    );
  }
}

/**
 * Reports each bot version separately, because pooling them measures two
 * opponents as one.
 *
 * That is the entire reason `bot/release.ts` exists, and this bench pooled
 * anyway — harmless while every logged deal was v1 and wrong the moment one was
 * not. `v=N` narrows to a single version when only one is wanted.
 */
function run(path: string, only: number | null): void {
  const raw = JSON.parse(readFileSync(path, "utf8")) as readonly LoggedHand[];
  const finished = (hand: LoggedHand): boolean =>
    hand.deal.contract !== null && hand.deal.completedTricks.length === 13;
  const played = raw.filter(finished);
  const reports = played.map((hand, index) => reportFor(hand, index));
  const corpus: Corpus = {
    byIndex: new Map(reports.map((report) => [report.index, report])),
    played,
  };

  console.log(`${raw.length} logged deals, ${reports.length} played to a finished contract`);
  for (const [key, count] of census(played)) {
    console.log(`  ${count} × bot ${key}`);
  }

  const versions = [...new Set(played.map((hand) => hand.botVersion ?? 0))].sort((a, b) => a - b);
  const wanted = only === null ? versions : versions.filter((version) => version === only);
  if (wanted.length === 0) {
    console.log(`\n  nothing logged for v${only}`);
    return;
  }
  for (const version of wanted) {
    const subset = reports.filter((report) => (played[report.index]!.botVersion ?? 0) === version);
    assess(`Bot v${version === 0 ? "?, before versions" : version} — ${subset.length} deals`, subset, corpus);
  }
  replaySection(corpus);
}

const versionArg = process.argv.find((arg) => arg.startsWith("v="));

run(
  process.argv[2] ?? "hands.json",
  versionArg === undefined ? null : Number(versionArg.slice("v=".length)),
);
