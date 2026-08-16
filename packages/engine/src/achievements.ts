import { opponentOf } from "./cards.js";
import type { DealScore } from "./scoring.js";
import type { TableSummary } from "./table.js";
import type { Card, DealState, Doubling, Level, Pair, PlayerId } from "./types.js";

/**
 * Every achievement family. An id is a permanent key in `achievement_unlocks`,
 * keyed by account — do not rename one once it has shipped.
 */
export type AchievementId =
  | "against-the-odds"
  | "axe"
  | "down-but-not-out"
  | "hands-lost"
  | "hands-played"
  | "hands-won"
  | "insult"
  | "marathon"
  | "nobody-wanted-it"
  | "sitzfleisch"
  | "slam"
  | "take-the-rubber"
  | "two-suiter";

export type Tier = "bronze" | "silver" | "gold";

export interface Unlock {
  readonly achievement: AchievementId;
  readonly tier: Tier;
}

/** Facts about one just-completed deal, from which every deal-level achievement is decided. */
export interface DealFacts {
  /** Declarer if the contract was made, the defender otherwise. Null when passed out. */
  readonly handWonBy: PlayerId | null;
  /** The Insult tier just reached by whichever player made a doubled/redoubled contract. */
  readonly insultTier: Pair<Tier | null>;
  readonly nobodyWantedIt: boolean;
  /** How many times each player took card 2 sight-unseen this deal. */
  readonly rejections: Pair<number>;
  /** The Axe tier just reached by whichever player set a contract. */
  readonly setTier: Pair<Tier | null>;
  /** The Slam tier just reached by whichever player made a slam. */
  readonly slamTier: Pair<Tier | null>;
  /** Whether each player's dealt hand held cards in two suits or fewer. */
  readonly twoSuited: Pair<boolean>;
}

function suitsInHand(hand: readonly Card[]): number {
  return new Set(hand.map((card) => card.suit)).size;
}

function slamTierFor(level: Level, vulnerable: boolean): Tier | null {
  if (level === 7) {
    return vulnerable ? "gold" : "silver";
  }
  if (level === 6) {
    return "bronze";
  }
  return null;
}

function insultTierFor(doubling: Doubling, vulnerable: boolean): Tier | null {
  if (doubling === "redoubled") {
    return vulnerable ? "gold" : "silver";
  }
  if (doubling === "doubled") {
    return "bronze";
  }
  return null;
}

function setTierFor(undertricks: number): Tier | null {
  if (undertricks >= 7) {
    return "gold";
  }
  if (undertricks >= 5) {
    return "silver";
  }
  if (undertricks >= 3) {
    return "bronze";
  }
  return null;
}

/**
 * Everything a deal can unlock, read off the state and score the instant it
 * completes. `state.drawTurns` and `state.initialHands` only live on the
 * in-progress `DealState` — once `nextDeal` moves on, both are gone — so this
 * has to be called at completion, not reconstructed later from `DealRecord`.
 */
export function dealFacts(
  state: DealState,
  score: DealScore | null,
  vulnerable: Pair<boolean>,
): DealFacts {
  const rejections: Pair<number> = [0, 0];
  for (const turn of state.drawTurns) {
    if (turn.choice === "took-second") {
      rejections[turn.by] += 1;
    }
  }

  const twoSuited: Pair<boolean> = [false, false];
  if (state.initialHands !== null) {
    twoSuited[0] = suitsInHand(state.initialHands[0]) <= 2;
    twoSuited[1] = suitsInHand(state.initialHands[1]) <= 2;
  }

  if (state.passedOut || score === null || state.contract === null) {
    return {
      handWonBy: null,
      insultTier: [null, null],
      nobodyWantedIt: state.passedOut,
      rejections,
      setTier: [null, null],
      slamTier: [null, null],
      twoSuited,
    };
  }

  const { declarer, doubling, level } = state.contract;
  const defender = opponentOf(declarer);
  const declarerVulnerable = vulnerable[declarer];

  const slamTier: Pair<Tier | null> = [null, null];
  const insultTier: Pair<Tier | null> = [null, null];
  const setTier: Pair<Tier | null> = [null, null];

  if (score.detail.made) {
    slamTier[declarer] = slamTierFor(level, declarerVulnerable);
    insultTier[declarer] = insultTierFor(doubling, declarerVulnerable);
  } else {
    setTier[defender] = setTierFor(score.detail.undertricks);
  }

  return {
    handWonBy: score.detail.made ? declarer : defender,
    insultTier,
    nobodyWantedIt: false,
    rejections,
    setTier,
    slamTier,
    twoSuited,
  };
}

/** Facts about a rubber the instant it completes. Every field is null until then. */
export interface RubberFacts {
  /** The winner, if they lost the rubber's own first game to get there. */
  readonly comebackWinner: PlayerId | null;
  /** Every deal of the rubber, including redeals of a passed-out hand. Null until it completes. */
  readonly handsPlayed: number | null;
  /** The winner, if the rubber was swept two games to none. */
  readonly sweepWinner: PlayerId | null;
  /** The winner, if the rubber completed just now. */
  readonly wonRubber: PlayerId | null;
}

export function rubberFacts(summary: TableSummary): RubberFacts {
  const { history, rubber } = summary;
  // A single game is not a rubber, by the game's own terminology (§3.6a) — and
  // structurally cannot be told apart from a sweep by `gamesWon` alone, since
  // the loser is always at zero games when only one is ever played. Take the
  // Rubber and Marathon are about rubbers specifically; nothing here fires for
  // a `game`-format match at all.
  if (rubber.format !== "rubber" || !rubber.complete || rubber.winner === null) {
    return { comebackWinner: null, handsPlayed: null, sweepWinner: null, wonRubber: null };
  }

  const winner = rubber.winner;
  const sweepWinner = rubber.gamesWon[opponentOf(winner)] === 0 ? winner : null;

  const firstGameWinner = history.find((deal) => deal.wonGameBy !== null)?.wonGameBy ?? null;
  const comebackWinner = firstGameWinner !== null && firstGameWinner !== winner ? winner : null;

  return { comebackWinner, handsPlayed: history.length, sweepWinner, wonRubber: winner };
}

/** Deals in a single rubber past which it counts as a Sitzfleisch marathon. */
const SITZFLEISCH_HANDS = 20;

/** A rubber won in exactly this many hands is the fastest a rubber can finish — both games made outright. */
const QUICK_RUBBER_HANDS = 2;

/** The achievements backed by a running lifetime counter rather than a one-shot event. */
export type CounterKey = "against-the-odds" | "hands-lost" | "hands-played" | "hands-won" | "marathon";

/** Thresholds for each counter-backed achievement, ascending bronze/silver/gold. */
export const COUNTER_THRESHOLDS: Record<CounterKey, readonly [number, number, number]> = {
  "against-the-odds": [50, 500, 5000],
  "hands-lost": [50, 250, 1000],
  "hands-played": [50, 250, 1000],
  "hands-won": [50, 250, 1000],
  marathon: [10, 50, 200],
};

/** The highest tier reached at `count`, given ascending bronze/silver/gold `thresholds`. */
export function tierForCount(count: number, thresholds: readonly [number, number, number]): Tier | null {
  if (count >= thresholds[2]) {
    return "gold";
  }
  if (count >= thresholds[1]) {
    return "silver";
  }
  if (count >= thresholds[0]) {
    return "bronze";
  }
  return null;
}

/** A stable identity for one (achievement, tier) pair, for a `Set` of what is already held. */
export function unlockKey(unlock: Unlock): string {
  return `${unlock.achievement}:${unlock.tier}`;
}

/**
 * What an account has already earned, in the shape the unlock functions below
 * need it — not the storage shape. The client and the server each keep their
 * own copy of this (a cached fetch and a D1 read, respectively) and feed it to
 * the same pure decision here, so "what does this unlock" is answered once
 * regardless of which host is asking.
 */
export interface AchievementProgress {
  readonly counters: Partial<Record<CounterKey, number>>;
  readonly unlocked: ReadonlySet<string>;
}

export interface AchievementUpdate {
  /** New values for whichever counters this changed — values, not deltas. */
  readonly counters: Partial<Record<CounterKey, number>>;
  /** Candidates not already in `progress.unlocked`. */
  readonly unlocked: readonly Unlock[];
}

/** Adds `delta` to one counter and reports its new value and, if crossed, the tier it just reached. */
function bump(
  progress: AchievementProgress,
  key: CounterKey,
  delta: number,
): { readonly count: number; readonly unlock: Unlock | null } | null {
  if (delta <= 0) {
    return null;
  }
  const before = progress.counters[key] ?? 0;
  const after = before + delta;
  const beforeTier = tierForCount(before, COUNTER_THRESHOLDS[key]);
  const afterTier = tierForCount(after, COUNTER_THRESHOLDS[key]);
  const unlock: Unlock | null =
    afterTier !== null && afterTier !== beforeTier ? { achievement: key, tier: afterTier } : null;
  return { count: after, unlock };
}

function bumpAll(
  progress: AchievementProgress,
  deltas: readonly (readonly [CounterKey, number])[],
): AchievementUpdate {
  const counters: Partial<Record<CounterKey, number>> = {};
  const unlocked: Unlock[] = [];
  for (const [key, delta] of deltas) {
    const result = bump(progress, key, delta);
    if (result !== null) {
      counters[key] = result.count;
      if (result.unlock !== null) {
        unlocked.push(result.unlock);
      }
    }
  }
  return { counters, unlocked };
}

function onlyNew(progress: AchievementProgress, candidates: readonly Unlock[]): Unlock[] {
  return candidates.filter((unlock) => !progress.unlocked.has(unlockKey(unlock)));
}

/**
 * Everything one deal just unlocked for one player, given what they already
 * hold. Pure: no I/O, so the same decision runs identically from a live
 * `DealState` in the browser and from a D1 read on the server.
 */
export function dealUnlocks(
  progress: AchievementProgress,
  facts: DealFacts,
  player: PlayerId,
): AchievementUpdate {
  const candidates: Unlock[] = [];
  const slamTier = facts.slamTier[player];
  if (slamTier !== null) {
    candidates.push({ achievement: "slam", tier: slamTier });
  }
  const insultTier = facts.insultTier[player];
  if (insultTier !== null) {
    candidates.push({ achievement: "insult", tier: insultTier });
  }
  const setTier = facts.setTier[player];
  if (setTier !== null) {
    candidates.push({ achievement: "axe", tier: setTier });
  }
  if (facts.twoSuited[player]) {
    candidates.push({ achievement: "two-suiter", tier: "bronze" });
  }
  if (facts.nobodyWantedIt) {
    candidates.push({ achievement: "nobody-wanted-it", tier: "bronze" });
  }

  const counted = bumpAll(progress, [
    ["against-the-odds", facts.rejections[player]],
    ["hands-lost", facts.handWonBy !== null && facts.handWonBy !== player ? 1 : 0],
    ["hands-played", 1],
    ["hands-won", facts.handWonBy === player ? 1 : 0],
  ]);

  return {
    counters: counted.counters,
    unlocked: onlyNew(progress, [...candidates, ...counted.unlocked]),
  };
}

/**
 * Everything one rubber just unlocked for one player. `facts.wonRubber` is
 * null until the rubber completes, and nothing here ever fires before then.
 */
export function rubberUnlocks(
  progress: AchievementProgress,
  facts: RubberFacts,
  player: PlayerId,
): AchievementUpdate {
  if (facts.wonRubber === null) {
    return { counters: {}, unlocked: [] };
  }

  const candidates: Unlock[] = [];
  if (facts.wonRubber === player) {
    candidates.push({ achievement: "take-the-rubber", tier: "bronze" });
  }
  if (facts.sweepWinner === player) {
    candidates.push({ achievement: "take-the-rubber", tier: "silver" });
  }
  if (facts.sweepWinner === player && facts.handsPlayed === QUICK_RUBBER_HANDS) {
    candidates.push({ achievement: "take-the-rubber", tier: "gold" });
  }
  if (facts.comebackWinner === player) {
    candidates.push({ achievement: "down-but-not-out", tier: "bronze" });
  }
  if (facts.wonRubber === player && (facts.handsPlayed ?? 0) > SITZFLEISCH_HANDS) {
    candidates.push({ achievement: "sitzfleisch", tier: "bronze" });
  }

  const counted = bumpAll(progress, [["marathon", 1]]);

  return {
    counters: counted.counters,
    unlocked: onlyNew(progress, [...candidates, ...counted.unlocked]),
  };
}
