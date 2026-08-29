import { dealOf, drawRevealFor, summarizeMatch, viewFor } from "@hb/engine";
import type {
  Card,
  CompletedTrick,
  DealScore,
  DrawReveal,
  MatchFormat,
  MatchStanding,
  MatchState,
  Pair,
  PlayerId,
  PlayerView,
} from "@hb/engine";

/**
 * Everything one seat is told about the game, and the only thing it is told.
 *
 * This is the shape that crosses the wire. It is deliberately the same shape
 * the screens already consume — strip the methods from `GameSession` in the web
 * app and this is what is left — so a networked game needs no new UI, only a
 * different source for the same data.
 *
 * What it must never contain, per §2.2: the opponent's hand, the undrawn stock,
 * and any discard at all bar one: the card this seat's own last turn threw,
 * named by `lastDraw` and only while that turn is the one that just resolved,
 * because §1.3 has the card being thrown away shown as it goes. The rules
 * engine is shared code that could run wholly client-side, so that boundary has
 * to be something tested rather than something assumed — see
 * `snapshot.test.ts`, which walks the serialized snapshot looking for any card
 * it should not hold.
 *
 * **And it must never contain a seed**, which duplicate introduced and which is
 * worse than a card. `DuplicateState.boards` holds the number each board is dealt
 * from, and one of those reconstructs an entire deal's stock order — every card
 * either player will be offered, in order, for a board that may not have been
 * played yet. `MatchStanding` carries the *summary* rather than the state for
 * exactly that reason: a board there is an index and a margin. `snapshot.test.ts`
 * walks for it as well, because a card-shaped walker cannot see a number.
 */
export interface SessionSnapshot {
  /** What a duplicate deal paid beyond its tricks. Always zero in a rubber. */
  readonly dealBonus: number;
  /** Deals finished in this match, the one just completed included. */
  readonly dealsPlayed: number;
  readonly format: MatchFormat;
  /** The card most recently added to this seat's hand, while the draw runs. */
  readonly justTaken: Card | null;
  /** The draw turn that just resolved, with only this seat's own cards named. */
  readonly lastDraw: DrawReveal | null;
  /** The resolved trick still lying on the table. Both cards were played face up. */
  readonly lastTrick: CompletedTrick | null;
  readonly matchComplete: boolean;
  /**
   * The first game of a two-game match is over and the match is not.
   *
   * On the wire rather than derived per host, because two hosts deriving it would be
   * two chances to get it wrong — and it is what tells the hands reveal to stop
   * offering a tap straight into the next deal. A boolean about the match, revealing
   * nothing about anybody's cards.
   */
  readonly halfComplete: boolean;
  /**
   * Who won the *match*, once it is over. Null while it runs, and null for a draw.
   *
   * On the wire rather than derived from the standing, because for a two-game match
   * the standing is the second game's and its winner is that game's — which is not the
   * result. That mistake shipped: a player with the higher total was told the computer
   * had won, because the computer won the second game.
   */
  readonly winner: PlayerId | null;
  readonly score: DealScore | null;
  /**
   * The standing, in whichever shape the format keeps it.
   *
   * The *summary*, never the state. A rubber's state is safe to send and a
   * session's is not: it holds the seed of every board, played or not.
   */
  readonly standing: MatchStanding;
  readonly view: PlayerView;
  readonly vulnerable: Pair<boolean>;
}

/**
 * Projects the table for one seat.
 *
 * The single place a server decides what to send, so there is one function to
 * get right and one to test — rather than a protocol whose safety depends on
 * every message handler remembering the rules.
 */
export function snapshotFor(match: MatchState, seat: PlayerId): SessionSnapshot {
  const deal = dealOf(match);
  const summary = summarizeMatch(match);
  const hand = deal.hands[seat];

  return {
    dealBonus: summary.bonus,
    dealsPlayed: summary.dealsPlayed,
    format: summary.format,
    justTaken: deal.phase === "draw" ? (hand[hand.length - 1] ?? null) : null,
    lastDraw: drawRevealFor(deal, seat),
    lastTrick: deal.completedTricks[deal.completedTricks.length - 1] ?? null,
    halfComplete: summary.halfComplete,
    winner: summary.winner,
    matchComplete: summary.complete,
    score: summary.score,
    // Deliberately not `summary.botStanding`, which is the bidder's shape and holds
    // a rubber a session does not have. This is what a screen draws.
    standing: summary.standing,
    view: viewFor(deal, seat),
    vulnerable: summary.vulnerable,
  };
}
