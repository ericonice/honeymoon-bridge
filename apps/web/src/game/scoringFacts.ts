import {
  bonusFor,
  contractTrickPoints,
  GAME_BONUS,
  GAME_THRESHOLD,
  honorsFor,
  matchBonusFor,
  overtrickPoints,
  scoreDuplicateDeal,
  slamBonus,
  undertrickPoints,
} from "@hb/engine";
import type { Card, Level, Pair, Rank, Strain, Suit } from "@hb/engine";

/**
 * Every number the scoring page prints, asked of the engine rather than retyped.
 *
 * **This module is the condition on that page existing at all.** `HelpOverlay`
 * used to say, deliberately, nothing about how a deal is scored, and the reason
 * it gave was exactly right: a scoring table written out by hand is a second
 * account of the rules with no way to stay honest as the first one changes,
 * which is help worth less than none. Deriving it removes that objection —
 * change `perTrickValue` or the doubled penalties and the page changes with
 * them, or fails its test.
 *
 * Nothing here is a constant. Where a figure looks like one, it is the result of
 * asking `scoring.ts` a question whose answer happens to be fixed.
 */

export { GAME_BONUS, GAME_THRESHOLD };

/** The levels a contract can be bid at, which is also every row of any table over them. */
const LEVELS: readonly Level[] = [1, 2, 3, 4, 5, 6, 7];

/** Suits and no-trump, in the order the page reads them: cheapest first. */
export const STRAIN_ORDER: readonly Strain[] = ["C", "D", "H", "S", "NT"];

export interface StrainValue {
  /** What the second and every later trick is worth — no-trump's first is dearer. */
  readonly each: number;
  /** What the first trick over book is worth. */
  readonly first: number;
  /** The cheapest level that reaches a game in one deal, or null if none does. */
  readonly gameAt: Level | null;
  readonly strain: Strain;
}

/**
 * What each strain pays, and what it takes to reach a game in one deal.
 *
 * `gameAt` is searched rather than stated, so 3NT, 4♥ and 5♣ are consequences of
 * the trick values and the threshold rather than three more numbers to keep in
 * step. A strain that could no longer reach 100 at any level would come back
 * null rather than quietly printing a wrong level.
 */
export function strainValues(): readonly StrainValue[] {
  return STRAIN_ORDER.map((strain) => ({
    each: contractTrickPoints(2, strain) - contractTrickPoints(1, strain),
    first: contractTrickPoints(1, strain),
    gameAt: LEVELS.find((level) => contractTrickPoints(level, strain) >= GAME_THRESHOLD) ?? null,
    strain,
  }));
}

export interface UndertrickRow {
  /** What being this many short costs in total, doubled and not vulnerable. */
  readonly doubled: number;
  /** The same, vulnerable. */
  readonly doubledVulnerable: number;
  readonly short: number;
}

/**
 * What going down costs, as running totals rather than per-trick figures.
 *
 * A total is what somebody actually wants: "down two doubled is 300" is the
 * question being asked, where "100 then 200" is arithmetic homework. Both come
 * from `undertrickPoints`, which already sums the escalation.
 */
export function undertrickTable(upTo = 4): readonly UndertrickRow[] {
  return Array.from({ length: upTo }, (_, index) => index + 1).map((short) => ({
    doubled: undertrickPoints(short, "doubled", false),
    doubledVulnerable: undertrickPoints(short, "doubled", true),
    short,
  }));
}

/** What one undoubled undertrick costs, which does not escalate. */
export function plainUndertrick(vulnerable: boolean): number {
  return undertrickPoints(1, "none", vulnerable);
}

/** What the step from one doubled undertrick to the next settles at, once it stops climbing. */
export function undertrickStep(vulnerable: boolean): number {
  const table = undertrickTable(6);
  const last = table.at(-1)!;
  const previous = table.at(-2)!;
  return vulnerable
    ? last.doubledVulnerable - previous.doubledVulnerable
    : last.doubled - previous.doubled;
}

export interface SlamValue {
  readonly bonus: number;
  readonly level: Level;
  /** What the contract itself is worth below the line at its cheapest strain. */
  readonly vulnerable: number;
}

/** The two slam levels and what reaching them adds. */
export function slamValues(): readonly SlamValue[] {
  return ([6, 7] as const).map((level) => ({
    bonus: slamBonus(level, false),
    level,
    vulnerable: slamBonus(level, true),
  }));
}

/** A holding of `count` top cards in a suit, for asking `honorsFor` what it is worth. */
function topCards(count: number, suit: Suit): readonly Card[] {
  const ranks: readonly Rank[] = [14, 13, 12, 11, 10];
  return ranks.slice(0, count).map((rank) => ({ rank, suit }));
}

export interface HonorValue {
  readonly four: number;
  readonly fourAces: number;
  readonly five: number;
}

/**
 * What honors pay, asked of `honorsFor` with the holdings that earn them.
 *
 * A constructed hand rather than three literals, for the same reason as
 * everything else here: these move together with the rule, or the test that
 * compares them catches it.
 */
export function honorValues(): HonorValue {
  return {
    four: honorsFor(topCards(4, "S"), "S"),
    fourAces: honorsFor(
      (["C", "D", "H", "S"] as const).map((suit) => ({ rank: 14, suit }) satisfies Card),
      "NT",
    ),
    five: honorsFor(topCards(5, "S"), "S"),
  };
}

export interface MatchBonuses {
  /** What a one-game match pays for winning it. */
  readonly game: number;
  /** A rubber where the loser won a game. */
  readonly rubber: number;
  /** A rubber the loser never got a game in. */
  readonly rubberUnbeaten: number;
}

export function matchBonuses(): MatchBonuses {
  return {
    game: matchBonusFor("game", 0),
    rubber: matchBonusFor("rubber", 1),
    rubberUnbeaten: matchBonusFor("rubber", 0),
  };
}

/**
 * The example the page leans on: what one hand is worth at two different bids.
 *
 * Worked rather than asserted, because the whole point is the size of the gap
 * between them. `tookLevel` is the tricks taken written as the level they would
 * have filled, so eleven tricks is 5 — and every figure comes from the same two
 * functions `scoreDeal` uses, including which side of the line each lands on.
 */
export function scoreIfBid(options: {
  readonly bid: Level;
  readonly strain: Strain;
  readonly tookLevel: Level;
}): { readonly above: number; readonly below: number; readonly game: boolean } {
  const { bid, strain, tookLevel } = options;
  const below = contractTrickPoints(bid, strain);
  return {
    above: overtrickPoints(tookLevel - bid, strain, "none", false),
    below,
    game: below >= GAME_THRESHOLD,
  };
}

export interface DuplicateBonuses {
  /** A game, paid on the deal that makes one. */
  readonly game: number;
  readonly gameVulnerable: number;
  /** A part-score: a flat figure, since there is nothing to accumulate toward. */
  readonly partScore: number;
}

/**
 * What a duplicate deal pays beyond its tricks.
 *
 * Asked of `bonusFor` with trick totals either side of the threshold rather than
 * stated, so the page cannot drift from the rule — and so the one thing about it a
 * player might not expect stays true on the page: the bonus is decided by the trick
 * points, not the level, which is why a doubled two-level contract can be a game.
 */
export function duplicateBonuses(): DuplicateBonuses {
  return {
    game: bonusFor(GAME_THRESHOLD, false),
    gameVulnerable: bonusFor(GAME_THRESHOLD, true),
    partScore: bonusFor(GAME_THRESHOLD - 1, false),
  };
}

/** No hands, so honors never turn up in a figure the page is using to show something else. */
const NO_HANDS: Pair<readonly Card[]> = [[], []];

/**
 * What one hand is worth at two different bids, settled the duplicate way.
 *
 * The same worked example the rubber page leans on, and it lands harder here: with
 * nothing carried forward, the whole difference between stopping short and bidding
 * the game is paid on the spot. Every figure comes from `scoreDuplicateDeal`, which
 * is the function the game itself uses.
 */
export function duplicateIfBid(options: {
  readonly bid: Level;
  readonly strain: Strain;
  readonly tookLevel: Level;
}): { readonly bonus: number; readonly total: number } {
  const { bid, strain, tookLevel } = options;
  const tricks = tookLevel + 6;
  const scored = scoreDuplicateDeal(
    {
      contract: { declarer: 0, doubling: "none", level: bid, strain },
      hands: NO_HANDS,
      tricksWon: [tricks, 13 - tricks],
    },
    [false, false],
  );
  return { bonus: scored.bonus, total: scored.points[0] };
}

/** What a contract that went down pays its declarer, which is the point: nothing. */
export function duplicateFailedBonus(): number {
  return duplicateIfBid({ bid: 4, strain: "H", tookLevel: 3 }).bonus;
}
