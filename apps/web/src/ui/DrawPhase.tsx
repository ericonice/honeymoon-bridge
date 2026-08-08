import { cardId } from "@hb/engine";
import type { Card, DrawChoice, Pair, PlayerView } from "@hb/engine";
import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DRAW_TIMING, drawTurnDuration } from "../game/timing.js";
import { revealsUnseenCard } from "@hb/engine";
import type { DrawPair, DrawReveal } from "../game/session.js";
import { CardBack, CardFace, CardSlot } from "./CardFace.js";
import { CardText } from "./CardText.js";
import { DrawFlight } from "./DrawFlight.js";
import type { Flight, Point } from "./DrawFlight.js";
import { DiscardPile, DrawDeck } from "./DrawPiles.js";
import { SeatLabel } from "./SeatLabel.js";

export interface DrawPhaseProps {
  readonly lastDraw: DrawReveal | null;
  /** The two cards your own last turn spent, for the recall control. */
  readonly lastOwnDraw: DrawPair | null;
  readonly opponentName: string;
  readonly vulnerable: Pair<boolean>;
  /** Development builds only: names the opponent's last two cards in the commentary. */
  readonly peekLastDraw: DrawPair | null;
  /**
   * Development builds only: card 1 of the opponent's turn, shown in the slot
   * where your own would be. Never enables the buttons — it is their turn.
   */
  readonly peekPending: Card | null;
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
 * The opponent's choice is public even though neither of their cards is. It is
 * the only thing you learn about their hand across the whole draw, so it is
 * said in full words as well as shown by where their cards fly.
 */
/**
 * The running commentary on the opponent's turn.
 *
 * While peeking it is the same sentence with the cards named, rather than a
 * second line beside it: watching a face-down card fly says what the bot chose
 * but never what it chose from, and that is most of what you need to judge a
 * draw rule.
 */
function OpponentLine({
  opponentName,
  peek,
  settling,
  view,
}: {
  readonly opponentName: string;
  readonly peek: DrawPair | null;
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

  if (peek !== null) {
    return (
      <span className="text-fuchsia-300/90">
        {choice === "kept-first" ? (
          <>
            {opponentName} kept the <CardText card={peek.taken} on="dark" /> and threw the{" "}
            <CardText card={peek.discarded} on="dark" />
          </>
        ) : (
          <>
            {opponentName} rejected the <CardText card={peek.discarded} on="dark" /> and took the{" "}
            <CardText card={peek.taken} on="dark" />
          </>
        )}
      </span>
    );
  }

  // Which card they acted on is the whole message; what rejecting entails is
  // the same every turn and does not need restating twenty-six times.
  return choice === "kept-first" ? (
    <>{opponentName} kept the first card.</>
  ) : (
    <>{opponentName} rejected the first card.</>
  );
}

/**
 * The turn you have just played, on demand.
 *
 * Both cards were yours to see at the time — §1.3 has you look at card 2 even
 * when you throw it away — and this reaches back exactly one turn, closing the
 * moment you take the next. It exists because the reveal is a card in motion
 * and can be missed, not to spare you remembering: the thirteen cards behind
 * this one stay gone.
 */
function LastDrawReview({
  onClose,
  pair,
}: {
  readonly onClose: () => void;
  readonly pair: DrawPair;
}): React.JSX.Element {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/75 px-6">
      <p className="text-sm text-white/60">Your last turn</p>
      <div className="flex items-start gap-6">
        {[
          { card: pair.taken, label: "into your hand" },
          { card: pair.discarded, label: "thrown away" },
        ].map((entry) => (
          <div key={entry.label} className="flex flex-col items-center gap-2">
            <CardFace card={entry.card} size="table" />
            <span className="text-xs text-white/50">{entry.label}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="rounded-xl bg-white px-6 py-3 text-base font-semibold text-stone-900"
        onClick={onClose}
      >
        Close
      </button>
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

export function DrawPhase({
  lastDraw,
  lastOwnDraw,
  onDecide,
  opponentName,
  peekLastDraw,
  peekPending,
  view,
  vulnerable,
}: DrawPhaseProps): React.JSX.Element {
  const [recalling, setRecalling] = useState(false);
  const turnCount = view.drawTurns.length;

  // Closes as soon as the next turn is taken: this reaches back exactly one
  // turn, never further.
  useEffect(() => {
    setRecalling(false);
  }, [turnCount]);
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const opponentRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<HTMLDivElement>(null);
  const mineRef = useRef<HTMLDivElement>(null);
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const [settling, setSettling] = useState(false);

  const pending = view.pending;
  const turn = lastDraw?.turn ?? 0;

  // The engine hands you card 1 the instant the opponent's turn resolves.
  // Turning it over that same instant invites a decision taken while you are
  // still being told what just happened, so it stays face down for a beat.
  const shown = settling ? null : pending;

  // Keyed on the turn number alone, deliberately: one flight per resolved turn,
  // replayed never. Re-running it on any other change would re-show a card the
  // player is meant to have to remember.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (lastDraw === null || container === null) {
      return;
    }

    // The opponent's cards do not fly. Their hand grows by one, the deck drops
    // by two and the line below says what they did — watching two face-down
    // cards travel added a second a turn and told you none of that. All that is
    // needed is long enough to register that a turn happened.
    if (lastDraw.by !== view.me) {
      setSettling(true);
      const beat = setTimeout(() => {
        setSettling(false);
      }, DRAW_TIMING.think);
      return () => {
        clearTimeout(beat);
      };
    }

    const bounds = container.getBoundingClientRect();
    const deck = centerIn(bounds, deckRef.current);
    const discard = centerIn(bounds, discardRef.current);
    const hand = centerIn(bounds, mineRef.current);
    if (deck === null || discard === null || hand === null) {
      return;
    }

    const slot = centerIn(bounds, pendingRef.current);
    const kept = lastDraw.choice === "kept-first";
    const holdsReveal = revealsUnseenCard(lastDraw);

    // Choreograph by card 1 and card 2, not by taken and discarded: card 1 goes
    // to your hand on a keep and to the discard on a reject, and card 2 takes
    // whichever place is left.
    const cardOne = kept ? lastDraw.taken : lastDraw.discarded;
    const cardTwo = kept ? lastDraw.discarded : lastDraw.taken;

    setFlights([
      {
        card: cardOne,
        delay: 0,
        // It was already face up in the middle, so it leaves from there.
        from: slot ?? deck,
        hold: 0,
        key: `${turn}-one`,
        size: "feature",
        to: kept ? hand : discard,
        via: null,
      },
      {
        card: cardTwo,
        delay: 0,
        from: deck,
        hold: holdsReveal ? DRAW_TIMING.hold : 0,
        key: `${turn}-two`,
        // Card 2 on a keep pauses in the middle at full size, big enough to
        // commit to memory. It is the only chance you get to see it.
        size: holdsReveal ? "feature" : "table",
        to: kept ? discard : hand,
        via: holdsReveal ? slot : null,
      },
    ]);

    const timer = setTimeout(() => {
      setFlights([]);
    }, drawTurnDuration(true, holdsReveal));

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn]);

  return (
    <div
      ref={containerRef}
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
        <div ref={opponentRef} className="flex">
          {Array.from({ length: view.handSizes[view.opponent] }, (_, index) => (
            <div key={index} className={index > 0 ? "-ml-4" : ""}>
              <CardBack size="mini" />
            </div>
          ))}
          {view.handSizes[view.opponent] === 0 ? (
            <span className="h-10 text-xs text-white/30">no cards yet</span>
          ) : null}
        </div>
      </div>

      {/* Deck, card 1 and the discard in one row: two cards leave the left,
          one ends in a hand and one ends on the right, every turn. */}
      <div className="flex items-center justify-center gap-3">
        <div ref={deckRef}>
          <DrawDeck remaining={view.stockRemaining - (pending === null ? 0 : 1)} />
        </div>
        <div ref={pendingRef} className="pb-6">
          {/* Guarded on DEV as well as on the data, so the branch folds away
              rather than merely never being reached. */}
          {shown === null && peekPending !== null ? (
            // Theirs, not yours — ringed in the debug color so it can never be
            // mistaken for a card you are being offered.
            // Card 1 only, exactly what the opponent is looking at — the same
            // card you would be shown in their seat. What they then did with it
            // is said in the line below and shown by where it flies.
            <div className="rounded-2xl ring-2 ring-fuchsia-400">
              <CardFace card={peekPending} size="feature" />
            </div>
          ) : shown === null ? (
            <CardBack size="feature" />
          ) : (
            <motion.div
              // Keyed on the card, so turning over each new card 1 is its own
              // moment rather than a silent swap.
              key={cardId(shown)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <CardFace card={shown} size="feature" />
            </motion.div>
          )}
        </div>
        <div ref={discardRef}>
          <DiscardPile count={view.drawTurns.length} />
        </div>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        {/* Your side of the table: the two buttons are your cards' equivalent
            here, so the label belongs with them. */}
        <SeatLabel active={shown !== null} name="You" vulnerable={vulnerable[view.me]} />

        <p className="flex min-h-10 items-center justify-center text-center text-sm text-white/70">
          <OpponentLine
            opponentName={opponentName}
            peek={peekLastDraw}
            settling={settling}
            view={view}
          />
        </p>

        {lastOwnDraw === null ? null : (
          <button
            type="button"
            className="self-center rounded-lg border border-white/25 px-3 py-1.5 text-xs text-white/70"
            onClick={() => {
              setRecalling(true);
            }}
          >
            Show my last draw
          </button>
        )}
        <button
          type="button"
          className="rounded-xl bg-white px-4 py-4 text-lg font-semibold text-stone-900 disabled:opacity-30"
          disabled={shown === null}
          onClick={() => {
            onDecide(true);
          }}
        >
          Keep {shown === null ? "this card" : <CardText card={shown} on="light" />}
        </button>
        <button
          type="button"
          className="rounded-xl border border-white/30 px-4 py-4 text-base font-medium text-white disabled:opacity-30"
          disabled={shown === null}
          onClick={() => {
            onDecide(false);
          }}
        >
          Reject
        </button>
      </div>

      {/* Where cards headed for your own hand are aimed: just above the hand
          pinned to the bottom of the app frame. */}
      <div ref={mineRef} className="absolute bottom-0 left-1/2 h-0 w-0" />

      {flights.map((flight) => (
        <DrawFlight key={flight.key} flight={flight} />
      ))}

      {recalling && lastOwnDraw !== null ? (
        <LastDrawReview
          pair={lastOwnDraw}
          onClose={() => {
            setRecalling(false);
          }}
        />
      ) : null}
    </div>
  );
}
