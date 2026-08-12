import { cardId } from "@hb/engine";
import type { Card, DrawChoice, Pair, PlayerView } from "@hb/engine";
import { motion } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import { DRAW_TIMING, drawPlayout } from "../game/timing.js";
import type { DrawPair, DrawReveal } from "../game/session.js";
import { CardBack, CardFace } from "./CardFace.js";
import type { CardSize } from "./CardFace.js";
import { DrawFlight } from "./DrawFlight.js";
import type { Flight, Point } from "./DrawFlight.js";
import { DiscardPile, DrawDeck } from "./DrawPiles.js";
import { SeatLabel } from "./SeatLabel.js";

export interface DrawPhaseProps {
  readonly lastDraw: DrawReveal | null;
  readonly opponentName: string;
  readonly vulnerable: Pair<boolean>;
  /**
   * Development builds only: the two cards the opponent's last turn spent, which
   * is what lets their turn be animated the way yours is.
   */
  readonly peekLastDraw: DrawPair | null;
  /** Development builds only: card 1 of the opponent's turn, shown in their pair. */
  readonly peekPending: Card | null;
  /**
   * Whether the computer's cards are actually being shown, which is the setting
   * *and* a game that holds them — over a network they never reach the device.
   * It is what puts the computer's own pair on the table.
   */
  readonly showingTheirCards: boolean;
  readonly view: PlayerView;
  onDecide(keep: boolean): void;
}

function lastOpponentChoice(view: PlayerView): DrawChoice | null {
  for (let index = view.drawTurns.length - 1; index >= 0; index--) {
    const turn = view.drawTurns[index]!;
    if (turn.by === view.opponent) {
      return turn.choice;
    }
  }
  return null;
}

/**
 * The running commentary on the opponent's turn.
 *
 * Their choice is public even though neither of their cards is. It is the only
 * thing you learn about their hand across the whole draw, so it is said in
 * words as well as shown by where their cards go.
 */
function OpponentLine({
  opponentName,
  settling,
  view,
}: {
  readonly opponentName: string;
  readonly settling: boolean;
  readonly view: PlayerView;
}): React.JSX.Element {
  if (view.toAct === view.opponent || settling) {
    return <>{opponentName} is drawing…</>;
  }

  const choice = lastOpponentChoice(view);
  if (choice === null) {
    return <>{opponentName} has not drawn yet.</>;
  }

  // The same two words the labels under your own pair use. "Rejected" was the
  // vocabulary of the buttons that pair replaced, and it needed translating
  // back into "and took an unknown card instead" every time it was read — which
  // is the reason those buttons went, and applies to a sentence just as well.
  return choice === "kept-first" ? (
    <>{opponentName} kept the first card.</>
  ) : (
    <>{opponentName} took the unseen card.</>
  );
}

/**
 * One half of the pair, and the tap that takes it.
 *
 * The card *is* the choice: one that can be seen and one that cannot, and
 * taking either is what the turn amounts to. The hit area is padded well past
 * the card because a draw is final the instant it is made — §1.6 gives a bid a
 * confirmation tap and gives this none, so the target has to be forgiving
 * instead.
 */
function ChoiceCard({
  card,
  label,
  onTake,
  slotRef,
}: {
  /** Null shows a back: card 2 always, and card 1 until it is yours to see. */
  readonly card: Card | null;
  /** What taking this card does, or null when the turn is not yours. */
  readonly label: string | null;
  readonly onTake: (() => void) | null;
  readonly slotRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  const takeable = onTake !== null;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        className={`rounded-2xl p-3 ${takeable ? "transition-transform active:scale-95" : "cursor-default"}`}
        disabled={!takeable}
        onClick={onTake ?? undefined}
      >
        <div ref={slotRef}>
          {card === null ? (
            <CardBack size="table" />
          ) : (
            <motion.div
              // Keyed on the card, so turning over each new card 1 is its own
              // moment rather than a silent swap.
              key={cardId(card)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <CardFace card={card} size="table" />
            </motion.div>
          )}
        </div>
      </button>
      {/* The height is held whether or not there is a label, so the pair does
          not shift up and down twice a turn. */}
      <span className="h-4 text-xs text-white/55">{label}</span>
    </div>
  );
}

/**
 * The computer's own pair, while its cards are being shown.
 *
 * It had a turn's use of yours once, marked with a ring. Position is what says
 * whose a card is, and borrowing your slot made position say nothing — so it
 * has its own, under its own hand, and the smaller size says it again. Never
 * tappable: it is not your decision. The ring is around the whole area rather
 * than each card, marking the thing that is not part of the game exactly once.
 */
function TheirPair({
  cardOne,
  oneRef,
  twoRef,
}: {
  /** Their card 1 while they are deciding; a back once the turn has resolved. */
  readonly cardOne: Card | null;
  readonly oneRef: React.RefObject<HTMLDivElement | null>;
  readonly twoRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2 rounded-lg p-1.5 ring-1 ring-fuchsia-400/40">
      <div ref={oneRef}>
        {cardOne === null ? <CardBack size="mini" /> : <CardFace card={cardOne} size="mini" />}
      </div>
      <div ref={twoRef}>
        <CardBack size="mini" />
      </div>
    </div>
  );
}

const TURNS_PER_PLAYER = 13;

/**
 * Your thirteen turns in the draw, spent one at a time as your hand fills.
 *
 * Hand size already counts them — every turn nets exactly one card, kept or
 * not — so this reads that count rather than tracking a second one. A spent
 * turn fills its dot solid, the way a card fills a hand; a hollow ring is a
 * turn still ahead. Shape carries "how many remain" rather than color, since
 * a hollow ring reads as open at a glance in a way a merely dim dot does
 * not. Monochrome deliberately: amber appears on exactly one dot, the current
 * turn, matching the one thing `SeatLabel` uses it for — "it's your move" —
 * rather than being spent decorating twelve dots that are not.
 */
function TurnTrack({
  active,
  taken,
}: {
  readonly active: boolean;
  readonly taken: number;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: TURNS_PER_PLAYER }, (_, index) => {
        const spent = index < taken;
        if (index === taken && active) {
          return (
            <motion.span
              key={index}
              className="h-1.5 w-1.5 rounded-full bg-amber-300"
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
            />
          );
        }
        return (
          <span
            key={index}
            className={`h-1.5 w-1.5 rounded-full ${spent ? "bg-white/70" : "border border-white/40"}`}
          />
        );
      })}
    </div>
  );
}

function centerIn(container: DOMRect, element: HTMLElement | null): Point | null {
  if (element === null) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - container.left + rect.width / 2,
    y: rect.top - container.top + rect.height / 2,
  };
}

/**
 * The two cards a resolved turn spent, or null when they are not this screen's
 * to show — which is every turn of the opponent's without their cards showing.
 */
function pairFor(reveal: DrawReveal, mine: boolean, peekLastDraw: DrawPair | null): DrawPair | null {
  if (!mine) {
    return peekLastDraw;
  }
  return reveal.discarded === null || reveal.taken === null
    ? null
    : { discarded: reveal.discarded, taken: reveal.taken };
}

export function DrawPhase({
  lastDraw,
  onDecide,
  opponentName,
  peekLastDraw,
  peekPending,
  showingTheirCards,
  view,
  vulnerable,
}: DrawPhaseProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const opponentRef = useRef<HTMLDivElement>(null);
  const oneRef = useRef<HTMLDivElement>(null);
  const twoRef = useRef<HTMLDivElement>(null);
  const theirOneRef = useRef<HTMLDivElement>(null);
  const theirTwoRef = useRef<HTMLDivElement>(null);
  const mineRef = useRef<HTMLDivElement>(null);
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const [settling, setSettling] = useState(false);

  const pending = view.pending;
  const turn = lastDraw?.turn ?? 0;

  // The engine hands each seat its card 1 the instant the other's turn
  // resolves. Turning one over in that same instant puts it on top of an
  // animation still running, so neither is turned over until the board is
  // still — yours here, and the computer's in the pair above.
  const shown = settling ? null : pending;
  const theirShown = settling ? null : peekPending;
  const decidable = shown !== null;

  // Keyed on the turn number alone, deliberately: one flight per resolved turn,
  // replayed never. Re-running it on any other change would re-show a card the
  // player is meant to have to remember.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (lastDraw === null || container === null) {
      return;
    }

    const mine = lastDraw.by === view.me;
    const pair = pairFor(lastDraw, mine, peekLastDraw);
    const playout = drawPlayout(lastDraw, !mine && showingTheirCards && pair !== null);
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Whoever just went, the board is busy until their turn has played out, and
    // no card 1 turns over while it is. Set for your own turn too: the engine
    // deals the computer its card the instant you tap, and without this it
    // turned face up over your own two cards still travelling.
    setSettling(true);
    timers.push(
      setTimeout(() => {
        setSettling(false);
      }, playout.duration),
    );

    // Each seat's cards leave that seat's own pair, and are drawn at that pair's
    // own size — which is the same thing the layout is saying, said again while
    // the cards are in the air.
    const size: CardSize = mine ? "table" : "mini";
    const bounds = container.getBoundingClientRect();
    const discard = centerIn(bounds, discardRef.current);
    const hand = centerIn(bounds, mine ? mineRef.current : opponentRef.current);
    const one = centerIn(bounds, mine ? oneRef.current : theirOneRef.current);
    const two = centerIn(bounds, mine ? twoRef.current : theirTwoRef.current);

    if (
      playout.animated &&
      pair !== null &&
      discard !== null &&
      hand !== null &&
      one !== null &&
      two !== null
    ) {
      const kept = lastDraw.choice === "kept-first";

      // Choreograph by card 1 and card 2, not by taken and discarded: card 1
      // goes to a hand on a keep and to the discard on a reject, and card 2
      // takes whichever place is left. Both leave from the pair rather than
      // from the stock, because that is where they already are.
      const cardOne = kept ? pair.taken : pair.discarded;
      const cardTwo = kept ? pair.discarded : pair.taken;

      setFlights([
        {
          card: cardOne,
          delay: 0,
          from: one,
          hold: 0,
          key: `${turn}-one`,
          size,
          to: kept ? hand : discard,
          via: null,
        },
        {
          card: cardTwo,
          delay: 0,
          from: two,
          hold: playout.holdsReveal ? DRAW_TIMING.hold : 0,
          key: `${turn}-two`,
          size,
          to: kept ? discard : hand,
          // Card 2 on a keep turns face up where it already lies and stays
          // there long enough to read. It is the only chance to see it.
          via: playout.holdsReveal ? two : null,
        },
      ]);

      timers.push(
        setTimeout(() => {
          setFlights([]);
        }, playout.duration),
      );
    }

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn]);

  return (
    <div
      ref={containerRef}
      // Deliberately not scrollable. Making it so was tried, to stop the app
      // frame's `overflow-hidden` cutting the bottom off in silence — but the
      // cards in flight are positioned against this box and pass beyond its
      // edges on the way to a hand, so a scrollbar appeared on every turn. The
      // sizes below are what has to keep this fitting instead.
      className="relative flex flex-1 flex-col items-center justify-between px-4 py-3"
    >
      <div className="flex flex-col items-center gap-1">
        {/* Lit while they are deciding — and while the board is still settling
            after their turn, since until it does the decision is not yours. */}
        <SeatLabel
          active={view.toAct === view.opponent || settling}
          name={opponentName}
          vulnerable={vulnerable[view.opponent]}
        />
        {/* Their hand as a growing row of backs — except while their cards are
            showing, when the same hand is already on screen face up in the band
            above and this is the identical information with less in it. */}
        {showingTheirCards ? null : (
          // Sized from the outset for all thirteen — 28px for the first card
          // and 12px for each one that overlaps it. The row still visibly grows
          // a card a turn, which is the point of it, but the box holding it
          // never changes, so nothing above or below is nudged by the growing.
          <div className="flex h-10 w-43 items-center justify-center">
            {view.handSizes[view.opponent] === 0 ? (
              <span className="text-xs text-white/30">no cards yet</span>
            ) : (
              Array.from({ length: view.handSizes[view.opponent] }, (_, index) => (
                <div key={index} className={index > 0 ? "-ml-4" : ""}>
                  <CardBack size="mini" />
                </div>
              ))
            )}
          </div>
        )}

        {/* Their side of the table, and only while their cards are showing —
            two unreadable backs would cost every deal anybody plays a strip of
            the screen to say nothing. */}
        {showingTheirCards ? (
          <TheirPair cardOne={theirShown} oneRef={theirOneRef} twoRef={theirTwoRef} />
        ) : null}

        {/* What they did, directly under whatever of theirs is on screen — the
            pair while it is showing, the face-down hand otherwise. It sat down
            in your own half once, which put a sentence about them as far from
            them as the layout allows. */}
        <p className="flex min-h-10 max-w-sm items-center justify-center px-4 text-center text-sm text-white/70">
          <OpponentLine opponentName={opponentName} settling={settling} view={view} />
        </p>
      </div>

      {/* Centered like every other pair on this screen, rather than pinned to
          the true left and right edges: that spread the two piles across the
          full width with a dead gap between them, out of step with the
          opponent's pair above and the decision pair below. Close together
          instead, the way a stock and a waste pile sit side by side on a
          real table — neither is a tap target, so proximity here is never
          read as a choice the way it would be for the decision pair below. */}
      <div className="flex items-start justify-center gap-6">
        <div ref={deckRef}>
          <DrawDeck remaining={view.stockRemaining - (pending === null ? 0 : 1)} />
        </div>
        <div ref={discardRef}>
          <DiscardPile count={view.drawTurns.length} />
        </div>
      </div>

      {/* The decision itself: the two cards this turn spends, one you can see
          and one you cannot. Taking either is the whole move. */}
      <div className="flex items-start justify-center gap-8">
        <ChoiceCard
          card={shown}
          label={decidable ? "Keep" : null}
          slotRef={oneRef}
          onTake={
            decidable
              ? () => {
                  onDecide(true);
                }
              : null
          }
        />
        <ChoiceCard
          card={null}
          label={decidable ? "Take unseen" : null}
          slotRef={twoRef}
          onTake={
            decidable
              ? () => {
                  onDecide(false);
                }
              : null
          }
        />
      </div>

      <div className="flex flex-col items-center gap-1">
        <SeatLabel active={decidable} name="You" vulnerable={vulnerable[view.me]} />
        <TurnTrack active={decidable} taken={view.handSizes[view.me]} />
      </div>

      {/* Where cards headed for a hand are aimed: yours pinned to the bottom of
          the app frame, theirs to the top. Anchors rather than the rows
          themselves, because their row is not always drawn — a flight must not
          depend on whether the thing it flies towards is currently on screen. */}
      <div ref={mineRef} className="absolute bottom-0 left-1/2 h-0 w-0" />
      <div ref={opponentRef} className="absolute top-0 left-1/2 h-0 w-0" />

      {flights.map((flight) => (
        <DrawFlight key={flight.key} flight={flight} />
      ))}
    </div>
  );
}
