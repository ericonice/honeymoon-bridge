import { drawRevealFor, ownDrawPairFor, summarise, viewFor } from "@hb/engine";
import type {
  Card,
  CompletedTrick,
  DealRecord,
  DealScore,
  DrawPair,
  DrawReveal,
  Pair,
  PlayerId,
  PlayerView,
  RubberState,
  TableState,
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
 * and any discard other than this seat's most recent one. The rules engine is
 * shared code that could run wholly client-side, so that boundary has to be
 * something tested rather than something assumed — see `snapshot.test.ts`,
 * which walks the serialised snapshot looking for any card it should not hold.
 */
export interface SessionSnapshot {
  /** Every deal of the rubber, oldest first, including the one just finished. */
  readonly history: readonly DealRecord[];
  /** The card most recently added to this seat's hand, while the draw runs. */
  readonly justTaken: Card | null;
  /** The draw turn that just resolved, with only this seat's own cards named. */
  readonly lastDraw: DrawReveal | null;
  /** The two cards this seat's own last turn spent — both were its to see. */
  readonly lastOwnDraw: DrawPair | null;
  /** The resolved trick still lying on the table. Both cards were played face up. */
  readonly lastTrick: CompletedTrick | null;
  readonly rubber: RubberState;
  readonly score: DealScore | null;
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
export function snapshotFor(table: TableState, seat: PlayerId): SessionSnapshot {
  const { deal } = table;
  const summary = summarise(table);
  const hand = deal.hands[seat];

  return {
    history: summary.history,
    justTaken: deal.phase === "draw" ? (hand[hand.length - 1] ?? null) : null,
    lastDraw: drawRevealFor(deal, seat),
    lastOwnDraw: deal.phase === "draw" ? ownDrawPairFor(deal, seat) : null,
    lastTrick: deal.completedTricks[deal.completedTricks.length - 1] ?? null,
    rubber: summary.rubber,
    score: summary.score,
    view: viewFor(deal, seat),
    vulnerable: summary.vulnerable,
  };
}
