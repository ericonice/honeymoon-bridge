import { SUITS, trumpSuit } from "@hb/engine";
import type { Card, Pair, PlayedCard, PlayerId, Rank, Strain } from "@hb/engine";

/**
 * Double-dummy: the tricks each player takes when both hands are face up and
 * both players play perfectly.
 *
 * This is the only thing in the bot folder that is given both hands, and it is
 * deliberately not a `Bot`. It answers "what was the right card", which is a
 * question about a *position*, not about a seat — the measurement harness asks
 * it of a finished deal, and a sampling bot asks it of a hand it has guessed.
 * Neither is a route from a `PlayerView` to hidden information, and nothing here
 * may ever be handed a `DealState`-derived position for a seat that is thinking.
 *
 * Honeymoon bridge is a far smaller search than four-handed bridge: two hands
 * rather than four, and a trick that is decided by its second card. Three things
 * carry it. Hands are bitmasks, so making and unmaking a play is two integer
 * operations. Positions are cached, and transpose constantly — the same twelve
 * cards reached by a different order of tricks is the same position. And
 * adjacent cards are collapsed to one move: with only two hands, every card not
 * held by either player is out of play forever, so two of my cards with no card
 * of theirs between them are not merely similar, they are interchangeable.
 */

const NO_RANK = -1;
const NO_SUIT = -1;

/** Rank 2 sits at bit 0, so a holding is 13 bits and fits in one char of a key. */
function bitFor(rank: Rank): number {
  return 1 << (rank - 2);
}

function rankFor(bit: number): Rank {
  return (bit + 2) as Rank;
}

/** A move is its suit and its bit, packed so the search can pass one number. */
function moveFor(suit: number, bit: number): number {
  return suit * 16 + bit;
}

function cardFor(move: number): Card {
  return { rank: rankFor(move & 15), suit: SUITS[move >> 4]! };
}

export interface Position {
  /** The cards still held. A card already played to `trick` is not in here. */
  readonly hands: Pair<readonly Card[]>;
  /** Who leads the current trick, whether or not they have played to it yet. */
  readonly leader: PlayerId;
  readonly strain: Strain;
  /** What has been played to the current trick: nothing, or the lead. */
  readonly trick: readonly PlayedCard[];
}

export interface Solution {
  /** A card that achieves `tricks` for whoever is to play. */
  readonly card: Card;
  /** Tricks from here under perfect play, counting the trick in progress. */
  readonly tricks: Pair<number>;
}

interface Setup {
  readonly ledRank: number;
  readonly ledSuit: number;
  readonly leader: number;
  readonly masks: number[];
  /** Tricks still to be completed, including any already led to. */
  readonly remaining: number;
  readonly toMove: number;
  readonly trump: number;
}

function setupFrom(position: Position): Setup {
  const masks = new Array<number>(8).fill(0);
  for (const player of [0, 1] as const) {
    for (const card of position.hands[player]) {
      const index = player * 4 + SUITS.indexOf(card.suit);
      masks[index] = masks[index]! | bitFor(card.rank);
    }
  }

  const trump = trumpSuit(position.strain);
  const led = position.trick[0];
  const leader = led === undefined ? position.leader : led.by;

  return {
    ledRank: led === undefined ? NO_RANK : led.card.rank - 2,
    ledSuit: led === undefined ? NO_SUIT : SUITS.indexOf(led.card.suit),
    leader,
    masks,
    remaining: Math.max(position.hands[0].length, position.hands[1].length),
    toMove: led === undefined ? leader : 1 - leader,
    trump: trump === null ? NO_SUIT : SUITS.indexOf(trump),
  };
}

/**
 * The search, over a mutable set of masks.
 *
 * Everything it returns is counted in tricks for player 0, so one number
 * describes the position whichever seat is thinking, and alpha-beta bounds mean
 * the same thing at every node rather than flipping sign with the mover.
 */
function createSearch(masks: number[], trump: number) {
  const table = new Map<string, number>();

  /**
   * The masks are the position. Nothing else about the deal can affect what is
   * left to win, so tricks reached by a different order of play share an entry.
   */
  function keyFor(leader: number, ledSuit: number, ledRank: number): string {
    return String.fromCharCode(
      masks[0]!,
      masks[1]!,
      masks[2]!,
      masks[3]!,
      masks[4]!,
      masks[5]!,
      masks[6]!,
      masks[7]!,
      leader * 256 + (ledSuit + 1) * 16 + (ledRank + 1),
    );
  }

  /**
   * The moves worth distinguishing, cheapest of each run first.
   *
   * Two of my cards with no card of theirs between them win exactly the same
   * tricks as each other, now and for the rest of the deal, so only one of them
   * is a move. Cards in neither hand are out of play and do not break a run —
   * which is why this collapses so much harder here than in ordinary bridge,
   * where 26 of the cards this ignores would still be in somebody's hand.
   *
   * The card already led is the exception, and getting it wrong is silent: it
   * has left the hand that played it, but it is still in this trick, so a queen
   * and an ace with only the led king between them are *not* interchangeable.
   * It has to be counted as a barrier for as long as it is on the table.
   */
  function movesFor(player: number, ledSuit: number, ledRank: number): number[] {
    const base = player * 4;
    const following = ledSuit !== NO_SUIT && masks[base + ledSuit]! !== 0;
    const moves: number[] = [];

    for (let suit = 0; suit < 4; suit++) {
      if (following && suit !== ledSuit) {
        continue;
      }
      const mine = masks[base + suit]!;
      if (mine === 0) {
        continue;
      }
      const theirs = masks[(1 - player) * 4 + suit]!;
      const barrier = suit === ledSuit ? theirs | (1 << ledRank) : theirs;

      let lowest = NO_RANK;
      for (let bit = 12; bit >= 0; bit--) {
        const mask = 1 << bit;
        if ((mine & mask) !== 0) {
          lowest = bit;
        } else if ((barrier & mask) !== 0 && lowest !== NO_RANK) {
          moves.push(moveFor(suit, lowest));
          lowest = NO_RANK;
        }
      }
      if (lowest !== NO_RANK) {
        moves.push(moveFor(suit, lowest));
      }
    }

    return moves;
  }

  function followerWins(ledSuit: number, ledRank: number, suit: number, bit: number): boolean {
    if (suit === ledSuit) {
      return bit > ledRank;
    }
    // Off-suit only wins by ruffing, and a ruff over a trump lead is impossible
    // because that lead would have been followed.
    return suit === trump;
  }

  function search(
    leader: number,
    ledSuit: number,
    ledRank: number,
    alphaIn: number,
    betaIn: number,
    remaining: number,
  ): number {
    if (remaining === 0) {
      return 0;
    }

    const key = keyFor(leader, ledSuit, ledRank);
    const stored = table.get(key);
    let lower = 0;
    let upper = remaining;
    if (stored !== undefined) {
      lower = stored >> 5;
      upper = stored & 31;
      if (lower === upper) {
        return lower;
      }
      if (lower >= betaIn) {
        return lower;
      }
      if (upper <= alphaIn) {
        return upper;
      }
    }

    const toMove = ledSuit === NO_SUIT ? leader : 1 - leader;
    const maximizing = toMove === 0;
    let alpha = alphaIn;
    let beta = betaIn;
    let best = maximizing ? -1 : remaining + 1;

    for (const move of movesFor(toMove, ledSuit, ledRank)) {
      const value = evaluateMove(move, toMove, leader, ledSuit, ledRank, alpha, beta, remaining);
      if (maximizing) {
        best = Math.max(best, value);
        alpha = Math.max(alpha, best);
      } else {
        best = Math.min(best, value);
        beta = Math.min(beta, best);
      }
      if (alpha >= beta) {
        break;
      }
    }

    if (best <= alphaIn) {
      upper = Math.min(upper, best);
    } else if (best >= betaIn) {
      lower = Math.max(lower, best);
    } else {
      lower = best;
      upper = best;
    }
    table.set(key, (lower << 5) | upper);

    return best;
  }

  /** Play the card, score what follows, take it back. */
  function evaluateMove(
    move: number,
    toMove: number,
    leader: number,
    ledSuit: number,
    ledRank: number,
    alpha: number,
    beta: number,
    remaining: number,
  ): number {
    const suit = move >> 4;
    const bit = move & 15;
    const index = toMove * 4 + suit;

    masks[index] = masks[index]! & ~(1 << bit);

    let value: number;
    if (ledSuit === NO_SUIT) {
      value = search(leader, suit, bit, alpha, beta, remaining);
    } else {
      const winner = followerWins(ledSuit, ledRank, suit, bit) ? toMove : leader;
      const won = winner === 0 ? 1 : 0;
      value = won + search(winner, NO_SUIT, NO_RANK, alpha - won, beta - won, remaining - 1);
    }

    masks[index] = masks[index]! | (1 << bit);

    return value;
  }

  return { evaluateMove, movesFor };
}

/** The best card for whoever is to play, and what the position is worth. */
export function solve(position: Position): Solution {
  const setup = setupFrom(position);
  if (setup.remaining === 0) {
    throw new Error("Nothing left to play");
  }

  const { evaluateMove, movesFor } = createSearch(setup.masks, setup.trump);
  const maximizing = setup.toMove === 0;
  let alpha = -1;
  let beta = setup.remaining + 1;
  let best = maximizing ? -1 : setup.remaining + 1;
  let chosen = NO_RANK;

  for (const move of movesFor(setup.toMove, setup.ledSuit, setup.ledRank)) {
    const value = evaluateMove(
      move,
      setup.toMove,
      setup.leader,
      setup.ledSuit,
      setup.ledRank,
      alpha,
      beta,
      setup.remaining,
    );
    if (chosen === NO_RANK || (maximizing ? value > best : value < best)) {
      best = value;
      chosen = move;
    }
    if (maximizing) {
      alpha = Math.max(alpha, best);
    } else {
      beta = Math.min(beta, best);
    }
  }

  return { card: cardFor(chosen), tricks: [best, setup.remaining - best] };
}

export interface MoveValue {
  /**
   * Every card that plays exactly like this one — the whole run of equivalents,
   * not just the representative the search used. A caller comparing cards across
   * several guesses at the opponent's hand needs a value for each card it might
   * actually play, and which card stands for a run changes with the guess.
   */
  readonly cards: readonly Card[];
  readonly tricks: Pair<number>;
}

/** Every distinguishable card for the player to move, and what each is worth. */
export function evaluateMoves(position: Position): MoveValue[] {
  const setup = setupFrom(position);
  if (setup.remaining === 0) {
    throw new Error("Nothing left to play");
  }

  const { evaluateMove, movesFor } = createSearch(setup.masks, setup.trump);

  return movesFor(setup.toMove, setup.ledSuit, setup.ledRank).map((move) => {
    const tricks = evaluateMove(
      move,
      setup.toMove,
      setup.leader,
      setup.ledSuit,
      setup.ledRank,
      -1,
      setup.remaining + 1,
      setup.remaining,
    );
    return { cards: runFrom(setup, move), tricks: [tricks, setup.remaining - tricks] };
  });
}

/** The cards this move stands for: itself, and everything above it up to the next barrier. */
function runFrom(setup: Setup, move: number): Card[] {
  const suit = move >> 4;
  const mine = setup.masks[setup.toMove * 4 + suit]!;
  const theirs = setup.masks[(1 - setup.toMove) * 4 + suit]!;
  const barrier = suit === setup.ledSuit ? theirs | (1 << setup.ledRank) : theirs;

  const cards: Card[] = [];
  for (let bit = move & 15; bit <= 12; bit++) {
    const mask = 1 << bit;
    if ((barrier & mask) !== 0) {
      break;
    }
    if ((mine & mask) !== 0) {
      cards.push(cardFor(moveFor(suit, bit)));
    }
  }

  return cards;
}

/**
 * What the position becomes once a particular card is played to it.
 *
 * The difference between this and `solve(position).tricks` is exactly what that
 * card cost, which is the measurement the harness is built around.
 */
export function tricksAfter(position: Position, card: Card): Pair<number> {
  const setup = setupFrom(position);
  if (setup.remaining === 0) {
    throw new Error("Nothing left to play");
  }

  const { evaluateMove } = createSearch(setup.masks, setup.trump);
  const move = moveFor(SUITS.indexOf(card.suit), card.rank - 2);
  const tricks = evaluateMove(
    move,
    setup.toMove,
    setup.leader,
    setup.ledSuit,
    setup.ledRank,
    -1,
    setup.remaining + 1,
    setup.remaining,
  );

  return [tricks, setup.remaining - tricks];
}
