import { opponentOf } from "./cards.js";
import type { Card, Contract, Doubling, Level, Pair, PlayerId, Strain } from "./types.js";

export interface DealResult {
  readonly contract: Contract;
  /** The 13-card hands as dealt, needed for honors. */
  readonly hands: Pair<readonly Card[]>;
  readonly tricksWon: Pair<number>;
}

export interface DealScore {
  readonly aboveLine: Pair<number>;
  readonly belowLine: Pair<number>;
  readonly detail: ScoreDetail;
}

/** Whether a seat has won the deal, lost it, or is still playing for it. */
export type OutlookState = "gone" | "open" | "reached";

export interface TrickOutlook {
  /** Tricks this seat still has to take. Zero once the target is reached. */
  readonly need: number;
  /** Tricks not yet played, the one in progress included. */
  readonly remaining: number;
  readonly state: OutlookState;
  /** Tricks this seat must take to win the deal — see `trickTarget`. */
  readonly target: number;
}

export interface ScoreDetail {
  readonly contractTricks: number;
  readonly honors: Pair<number>;
  readonly insult: number;
  readonly made: boolean;
  readonly overtricks: number;
  readonly slamBonus: number;
  readonly undertricks: number;
}

const BOOK = 6;

/** Tricks in a deal. Every hand is played out to all thirteen — see `REQUIREMENTS.md` §1. */
export const TRICKS = 13;

/**
 * How many tricks a seat has to take to win the deal.
 *
 * Declarer needs the book plus the level. The defender needs one more than what
 * that leaves, so the two targets sum to fourteen against thirteen tricks — which
 * is exactly why only one side can ever reach its own and the deal cannot be drawn.
 */
export function trickTarget(contract: Contract, seat: PlayerId): number {
  const required = contract.level + BOOK;
  return seat === contract.declarer ? required : TRICKS - required + 1;
}

/**
 * Where a deal stands from one seat, counted in tricks.
 *
 * `gone` is the state worth having: a deal is frequently decided several tricks
 * before its last card is played, and nothing else in the engine says so. It is
 * exactly the complement of the opponent's `reached`, since the two targets sum to
 * one more than the tricks in a deal.
 *
 * Finer gradations were tried and removed. There was a `jeopardy` and a `tight`,
 * cut from how many tricks a seat could still afford to lose, so a screen could
 * escalate as the margin ran out. With both seats' outlooks on screen at once that
 * is redundant: the opponent closing in *is* the margin running out, said by their
 * own count rather than by a colour on yours.
 *
 * Derived rather than stored, so it cannot disagree with `scoreDeal`.
 */
export function trickOutlook({
  contract,
  seat,
  tricksWon,
}: {
  readonly contract: Contract;
  readonly seat: PlayerId;
  readonly tricksWon: Pair<number>;
}): TrickOutlook {
  const target = trickTarget(contract, seat);
  const need = Math.max(0, target - tricksWon[seat]);
  const remaining = TRICKS - tricksWon[0] - tricksWon[1];

  return {
    need,
    remaining,
    state: need === 0 ? "reached" : need > remaining ? "gone" : "open",
    target,
  };
}

/** Points per trick over book, for overtricks and for the body of a contract. */
function perTrickValue(strain: Strain): number {
  if (strain === "C" || strain === "D") {
    return 20;
  }
  return 30;
}

function multiplier(doubling: Doubling): number {
  if (doubling === "doubled") {
    return 2;
  }
  if (doubling === "redoubled") {
    return 4;
  }
  return 1;
}

/** Below-the-line value of a made contract, before doubling. No-trump scores 40 for the first trick. */
export function contractTrickPoints(level: Level, strain: Strain): number {
  if (strain === "NT") {
    return 40 + 30 * (level - 1);
  }
  return perTrickValue(strain) * level;
}

export function overtrickPoints(
  count: number,
  strain: Strain,
  doubling: Doubling,
  vulnerable: boolean,
): number {
  if (count <= 0) {
    return 0;
  }
  if (doubling === "none") {
    return count * perTrickValue(strain);
  }
  const each = vulnerable ? 200 : 100;
  return count * each * (doubling === "redoubled" ? 2 : 1);
}

export function undertrickPoints(count: number, doubling: Doubling, vulnerable: boolean): number {
  if (count <= 0) {
    return 0;
  }
  if (doubling === "none") {
    return count * (vulnerable ? 100 : 50);
  }

  let total = 0;
  for (let n = 1; n <= count; n++) {
    if (vulnerable) {
      total += n === 1 ? 200 : 300;
    } else if (n === 1) {
      total += 100;
    } else if (n <= 3) {
      total += 200;
    } else {
      total += 300;
    }
  }
  return doubling === "redoubled" ? total * 2 : total;
}

export function slamBonus(level: Level, vulnerable: boolean): number {
  if (level === 6) {
    return vulnerable ? 750 : 500;
  }
  if (level === 7) {
    return vulnerable ? 1500 : 1000;
  }
  return 0;
}

/**
 * Honors held in a single hand: 100 for four of the five trump honors, 150 for
 * all five, 150 for all four aces at no-trump. Scored by whoever holds them,
 * declarer or defender alike, and awarded automatically.
 */
export function honorsFor(hand: readonly Card[], strain: Strain): number {
  if (strain === "NT") {
    const aces = hand.filter((card) => card.rank === 14).length;
    return aces === 4 ? 150 : 0;
  }
  const held = hand.filter((card) => card.suit === strain && card.rank >= 10).length;
  if (held === 5) {
    return 150;
  }
  if (held === 4) {
    return 100;
  }
  return 0;
}

export function scoreDeal(result: DealResult, vulnerable: Pair<boolean>): DealScore {
  const { contract, hands, tricksWon } = result;
  const { declarer, doubling, level, strain } = contract;
  const defender = opponentOf(declarer);
  const declarerVulnerable = vulnerable[declarer];

  const required = trickTarget(contract, declarer);
  const taken = tricksWon[declarer];
  const made = taken >= required;

  const aboveLine: Pair<number> = [0, 0];
  const belowLine: Pair<number> = [0, 0];

  const honors: Pair<number> = [honorsFor(hands[0], strain), honorsFor(hands[1], strain)];
  aboveLine[0] += honors[0];
  aboveLine[1] += honors[1];

  let overtricks = 0;
  let undertricks = 0;
  let insult = 0;
  let slam = 0;

  if (made) {
    belowLine[declarer] += contractTrickPoints(level, strain) * multiplier(doubling);

    overtricks = taken - required;
    aboveLine[declarer] += overtrickPoints(overtricks, strain, doubling, declarerVulnerable);

    slam = slamBonus(level, declarerVulnerable);
    aboveLine[declarer] += slam;

    if (doubling === "doubled") {
      insult = 50;
    } else if (doubling === "redoubled") {
      insult = 100;
    }
    aboveLine[declarer] += insult;
  } else {
    undertricks = required - taken;
    aboveLine[defender] += undertrickPoints(undertricks, doubling, declarerVulnerable);
  }

  return {
    aboveLine,
    belowLine,
    detail: {
      contractTricks: belowLine[declarer],
      honors,
      insult,
      made,
      overtricks,
      slamBonus: slam,
      undertricks,
    },
  };
}

export function declarerOf(contract: Contract): PlayerId {
  return contract.declarer;
}
