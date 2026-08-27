import { buildDeck, cardId } from "@hb/engine";
import type { Card, Pair, PlayerView } from "@hb/engine";

/**
 * What this seat saw of one board it has already played.
 *
 * **The thirteen pairs it was offered**, in order — which is everything, because the
 * other stream falls out of it by elimination. A turn spends exactly two stock cards
 * and turns alternate, so the 26 cards in these pairs are precisely one seat's offers
 * and the remaining 26 are the other's.
 *
 * Recorded by the host as the deal is played rather than read out of engine state, for
 * the reason the `Bot` interface has always given: recall handed over explicitly is
 * recall a difficulty rung can hand over *less* of. It is also why this cannot live on
 * `DealState` — that shape is what `viewFor` projects from, and a seed or a pairing
 * inside it is a leak waiting for somebody to forget to strip it.
 */
export interface BoardOffers {
  /** Which board of the session, by its index. */
  readonly board: number;
  /** The pairs this seat faced, oldest turn first. */
  readonly offers: readonly Pair<Card>[];
}

/**
 * Everything this seat remembers of the boards it has played, and nothing about which
 * one it is playing now.
 *
 * **Deliberately not told which board this is**, though the host knows. Being told
 * would make the bot strong in a way no person could be: identifying the board from
 * the cards is most of the work a person does on a replay, and skipping it is not
 * remembering but being handed the answer. `difficulty.ts` holds every rung to being
 * wrong the way a person is wrong, and this is the mirror of that rule.
 *
 * So the bot gets the memory and has to work out which of it applies — see
 * `offersFacingOpponent`. The pleasant consequence is that lossy recall then costs it
 * twice over, in what it remembers *and* in whether it can tell where it is, which is
 * exactly how a person fails.
 */
export type BoardMemory = readonly BoardOffers[];

/**
 * **A board's memory cannot help this seat's own draw, and that falls out of the
 * seat swap rather than being a decision.**
 *
 * What a seat remembers is the stream it was *offered*. A replay hands it the other
 * one — that is the whole mechanic — so its memory says nothing about which card is
 * coming next on its own turns. It says everything about the opponent's. That is why
 * `chooseDraw` takes no memory while `chooseCall` and `choosePlay` do, and it is a
 * pleasant accident: the one place where knowing the board would let a seat see card 2
 * before deciding, which §1.3 exists to prevent, is the one place the memory is silent.
 *
 * One thing it could know and does not, recorded so nobody assumes it is covered: every
 * deal is played to all thirteen tricks, so at the end of the first run this seat saw
 * the *thirteen cards the opponent kept* out of the stream it is about to be offered.
 * That is real information about its own upcoming draw — thirteen of the twenty-six
 * cards it will see, without their pairings. Not built, and not obviously worth
 * building: without the pairing it cannot say what a given card 2 will be.
 */

/** Both cards of every pair: the 26 this seat was offered on that board. */
function offeredCards(entry: BoardOffers): Card[] {
  return entry.offers.flatMap(([first, second]) => [first, second]);
}

/**
 * The pairs the *opponent* is being offered this deal, if this seat can tell which
 * board it is on.
 *
 * The reasoning, which is exact rather than probabilistic:
 *
 *  - On a board this seat has played, it saw 26 cards — the stream it was offered.
 *    The other 26 are the stream the other seat was offered.
 *  - A replay swaps the seats, so this seat is now offered the *other* stream and the
 *    opponent is offered the one this seat faced. Those pairs are what it remembers.
 *  - So: every card offered to this seat so far this deal must belong to the *other*
 *    26 of the board being replayed. That narrows the candidates, and one or two cards
 *    usually settles it.
 *
 * Null when it cannot tell — no memory, more than one board still consistent, or the
 * board it is on is one it has not played. **Ambiguity reads as not knowing**, rather
 * than as a guess between two boards: a wrong pairing would make every sampled hand
 * confidently impossible, which is worse than sampling without one.
 */
export function offersFacingOpponent(
  memory: BoardMemory,
  seen: readonly Card[],
): readonly Pair<Card>[] | null {
  if (memory.length === 0 || seen.length === 0) {
    return null;
  }

  const deck = buildDeck();
  const candidates = memory.filter((entry) => {
    const mine = new Set(offeredCards(entry).map(cardId));
    // The complement: what the *other* seat was offered on that board, which is what
    // this seat is offered on the replay.
    const theirs = new Set(deck.filter((card) => !mine.has(cardId(card))).map(cardId));
    return seen.every((card) => theirs.has(cardId(card)));
  });

  return candidates.length === 1 ? candidates[0]!.offers : null;
}

/**
 * What this seat has been offered so far this deal, which is what identifies the board.
 *
 * Its own hand, its own discards and the cards it has already played — every card it
 * has been shown. All three are needed. Thirteen kept cards alone would leave far more
 * boards consistent and it is the discards that make the identification quick; and a
 * card this seat has played has *left* the hand, so without the third group the
 * evidence would shrink as the deal went on rather than staying put.
 */
export function offeredSoFar(view: PlayerView, discards: readonly Card[]): Card[] {
  const mine: Card[] = [...view.hand, ...discards];
  for (const trick of view.completedTricks) {
    for (const played of trick.cards) {
      if (played.by === view.me) {
        mine.push(played.card);
      }
    }
  }
  for (const played of view.currentTrick) {
    if (played.by === view.me) {
      mine.push(played.card);
    }
  }
  return mine;
}
