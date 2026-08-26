import { cardId } from "@hb/engine";
import type { Card, DrawChoice, DrawTake, Pair, PlayerId, PlayerView } from "@hb/engine";
import { motion } from "framer-motion";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { DRAW_TIMING, currentPacing, drawPlayout } from "../game/timing.js";
import { completeWalkthrough, drawLessons, drawTour, walkthroughDone } from "../game/walkthrough.js";
import type { TourTarget } from "../game/walkthrough.js";
import type { DrawReveal, DrawSpend } from "../game/session.js";
import { CardBack, CardFace, CardSlot } from "./CardFace.js";
import type { CardSize } from "./CardFace.js";
import { CardFlight, centerIn } from "./CardFlight.js";
import type { Flight, Point } from "./CardFlight.js";
import { CARD_WIDTHS, MINI_MIN_STEP, spreadStep, useRowRoom } from "./Hand.js";
import { CardText } from "./CardText.js";
import { DrawLessonNote } from "./DrawLessonNote.js";
import { Spotlight } from "./Spotlight.js";
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
  readonly peekLastDraw: DrawSpend | null;
  /** Development builds only: card 1 of the opponent's turn, shown in their pair. */
  readonly peekPending: Card | null;
  /**
   * Whether the computer's cards are actually being shown, which is the setting
   * *and* a game that holds them — over a network they never reach the device.
   * It is what puts the computer's own pair on the table.
   */
  readonly showingTheirCards: boolean;
  readonly view: PlayerView;
  /**
   * Whether to walk a first-time player through the draw — see `walkthrough.ts`.
   * False at a table with somebody else, who would be sitting there waiting while
   * one player read three notes.
   */
  readonly walkthrough: boolean;
  onDecide(take: DrawTake): void;
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
 * The choice itself, picked out of the sentence around it.
 *
 * Three outcomes read at a glance rather than by being read word by word, which
 * they were not: one line of uniform small text, changing twenty-six times a deal,
 * is a thing you stop looking at. Amber for the same reason the takeable edge is
 * amber — it is the one colour this screen spends on what is happening now.
 */
function Chose({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <span className="font-semibold text-amber-200">{children}</span>;
}

/**
 * The running commentary on the opponent's turn.
 *
 * Their choice is public even though neither of their cards is, and it is the only
 * thing you ever learn about their hand — so it is said in words as well as shown
 * by where their cards go.
 */
function OpponentLine({
  settling,
  view,
}: {
  readonly settling: boolean;
  readonly view: PlayerView;
}): React.JSX.Element {
  if (view.toAct === view.opponent || settling) {
    return <>drawing…</>;
  }

  const choice = lastOpponentChoice(view);
  if (choice === null) {
    return <>has not drawn yet</>;
  }

  // The same words the labels under the choices use. "Rejected" was the vocabulary
  // of the buttons those cards replaced, and it needed translating back into "and
  // took an unknown card instead" every time it was read — which is the reason those
  // buttons went, and applies to a sentence just as well.
  //
  // No name and no full stop: this is a clause finishing the seat label beside it,
  // which is where the name now lives. It had been on the screen twice in adjacent
  // bands, once as a label and once as the subject of this sentence.
  switch (choice) {
    case "kept-first": {
      return (
        <>
          kept the <Chose>face-up card</Chose>
        </>
      );
    }
    case "took-second": {
      return (
        <>
          took the <Chose>unseen card</Chose>
        </>
      );
    }
  }
}

/**
 * The edge that marks a card as one this turn can be spent on.
 *
 * Position is what this screen uses to say what a thing is, and the two choices sit
 * in one row saying it properly — so what is left for this is the other half: *now*.
 * It says the board has settled and the turn is yours, which is a thing the row's
 * mere existence cannot say, and it is why it appears and disappears rather than
 * being painted on.
 *
 * Amber because the app already spends amber on exactly one idea — it is your move
 * (`SeatLabel` when active, the current dot in `TurnTrack`) — and "you may take
 * this" is that same idea pointed at a card.
 *
 * Drawn outside the box rather than as a border, so nothing shifts by a pixel when
 * it appears and disappears twenty-six times a deal.
 *
 * **Two layers, because one did not survive a face-up card.** A single amber ring
 * was pale amber directly against the near-white `--color-card-face`, which is the
 * one ground it cannot be seen on — it read as part of the card's own edge rather
 * than as a mark on it. So a dark gap goes between them: card, then 2px of
 * translucent black, then 3px of amber. The amber now has dark on both sides
 * whatever it is drawn over.
 *
 * Translucent black rather than `ring-offset`, which takes a solid color. The table
 * ground is a per-theme variable *and* carries a radial sheen in the hockey theme,
 * so any one color would be a visibly wrong patch somewhere; darkening whatever is
 * actually behind it is correct on both themes and needs to know neither.
 */
const TAKEABLE_EDGE =
  "rounded-xl shadow-[0_0_0_2px_rgba(0,0,0,0.55),0_0_0_5px_#fbbf24]";

/**
 * One of the two cards this turn spends, and the tap that takes it.
 *
 * The card *is* the choice: one that can be seen and one that cannot, and taking
 * either is what the turn amounts to. The hit area is padded well past the card
 * because a draw is final the instant it is made — §1.6 gives a bid a confirmation
 * tap and gives this none, so the target has to be forgiving instead.
 */
function ChoiceCard({
  card,
  empty,
  label,
  onTake,
  slotRef,
}: {
  /** Null shows a back: card 2 always, and card 1 until it is yours to see. */
  readonly card: Card | null;
  /**
   * The slot has nothing of its own to show right now, either because this
   * turn's flight from the stock is still in the air or because its cards
   * have already left for the hand or the discard — an empty outline either
   * way, on the same reasoning `PlayPhase` suppresses a slot's static content
   * while its card is mid-flight: there must never be a card sitting here
   * *and* one flying over it, in either direction, at once. A settled turn's
   * card 2 is the case a flag for only the *arriving* half would have
   * missed — without covering the *departed* half too, the slot fell back to
   * a plain card back the instant a card was taken, reading as an unseen
   * card still sitting there rather than as the empty slot it actually was
   * until the next turn's own flight landed.
   */
  readonly empty: boolean;
  /** What this card is, or null when the turn is not yours. */
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
        <div ref={slotRef} className={takeable ? TAKEABLE_EDGE : undefined}>
          {empty ? (
        <CardSlot size="table" />
      ) : card === null ? (
        <CardBack size="table" />
      ) : (
        <motion.div
          // Keyed on the card, so a new card 1 is its own element rather
          // than a silent swap.
          key={cardId(card)}
          // No mount animation: this only ever appears once its own
          // flight from the stock has already arrived solid — see the
          // deal-in effect's `fade: false` — so fading it in again on
          // top of that would be the same blink `PlayPhase`'s `Slot`
          // already had, just moved to this screen instead.
          initial={false}
          animate={{ opacity: 1, scale: 1 }}
        >
              <CardFace card={card} size="table" />
            </motion.div>
          )}
        </div>
      </button>
      {/* The height is held whether or not there is a label, so the pair does not
          shift up and down twice a turn. Amber when there is one, matching the edge
          above it and the choice named in the commentary — a second cue for the same
          fact, and the only one that is not sitting against a card face. */}
      <span className="h-4 text-xs font-medium text-amber-200">{label}</span>
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
 * What a spent turn's dot is filled with: which of the cards on offer it took.
 *
 * Color, because shape is already spoken for — filled is a turn spent and
 * hollow a turn still ahead, and "how many are left" has to stay readable at a
 * glance. Amber is not available either: this screen spends amber on exactly
 * one idea, "it is your move".
 *
 * The distinction worth drawing is how much was known at the moment of the
 * decision, which is the whole of what this phase asks. A card that was face up
 * and a card that was not are different bets, and thirteen of them in a row is a
 * record of how somebody played the draw rather than merely how far through it
 * they are.
 */
const SPENT_DOT: Record<DrawChoice, string> = {
  "kept-first": "bg-sky-300",
  "took-second": "bg-violet-400",
};

/** One seat's draw turns, oldest first. Public: the choice is, the cards are not. */
function choicesFor(view: PlayerView, seat: PlayerId): DrawChoice[] {
  return view.drawTurns.filter((turn) => turn.by === seat).map((turn) => turn.choice);
}

/**
 * Thirteen turns in the draw, spent one at a time as a hand fills.
 *
 * Drawn for both seats. Theirs is the same information the commentary line
 * gives — the choice is public, the cards never are — except that the line only
 * ever says what they did *last*, and thirteen of these say what they have been
 * doing. Nothing here is a widening of what crosses the wire: `drawTurns` has
 * always carried every choice both ways.
 *
 * `live` marks the turn currently being decided, and is only ever passed for
 * this seat — it is amber, and amber on this screen means "it's your move" and
 * nothing else. Their own seat label is what says the turn is theirs.
 */
function TurnTrack({
  choices,
  live,
}: {
  readonly choices: readonly DrawChoice[];
  readonly live: boolean;
}): React.JSX.Element {
  const taken = choices.length;

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: TURNS_PER_PLAYER }, (_, index) => {
        const choice = choices[index];
        if (index === taken && live) {
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
            className={`h-1.5 w-1.5 rounded-full ${
              choice === undefined ? "border border-white/40" : SPENT_DOT[choice]
            }`}
          />
        );
      })}
    </div>
  );
}

/**
 * Whether two rects describe the same box.
 *
 * A `DOMRect` is a fresh object every time one is measured, so setting it into state
 * unconditionally is a state change on every measurement whether or not anything
 * moved. Guarding on the values means a stray extra render cannot start the effect
 * that sets it looping against itself — which is the failure this is here to make
 * structurally impossible rather than merely absent.
 */
function sameRect(a: DOMRect | null, b: DOMRect): boolean {
  return (
    a !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
  );
}

/**
 * Where a card actually sits in the hand below, once `Hand` has it.
 *
 * The engine hands back the new sorted hand the instant a turn resolves, so
 * by the time this runs `Hand` has already re-rendered with the kept card in
 * its real, sorted slot — this only has to find it. A generic point under
 * the table would fly the card to the right neighborhood; this flies it to
 * the exact card it is about to become.
 */
function findHandSlot(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
}

/**
 * The cards a resolved turn spent, or null when they are not this screen's to
 * show — which is every turn of the opponent's without their cards showing.
 */
function pairFor(
  reveal: DrawReveal,
  mine: boolean,
  peekLastDraw: DrawSpend | null,
): DrawSpend | null {
  if (!mine) {
    return peekLastDraw;
  }
  return reveal.discarded.length === 0 || reveal.taken === null
    ? null
    : { discarded: reveal.discarded, taken: reveal.taken };
}

/**
 * Where each card of a resolved turn travels, keyed by which one was taken.
 *
 * Choreographed by card 1 and card 2 rather than by taken and discarded, because
 * which of the two goes where *is* the choice. Both leave from the pair rather
 * than from the stock, since that is where they already are.
 */
interface DrawLeg {
  readonly card: Card;
  /** Held face up partway, for a card this seat has not seen before. */
  readonly reads: boolean;
  readonly source: "one" | "two";
  readonly target: "discard" | "hand";
}

function legsFor(choice: DrawChoice, spend: DrawSpend): DrawLeg[] {
  switch (choice) {
    case "kept-first": {
      return [
        { card: spend.taken, reads: false, source: "one", target: "hand" },
        { card: spend.discarded[0]!, reads: true, source: "two", target: "discard" },
      ];
    }
    case "took-second": {
      return [
        { card: spend.discarded[0]!, reads: false, source: "one", target: "discard" },
        { card: spend.taken, reads: false, source: "two", target: "hand" },
      ];
    }
  }
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
  walkthrough,
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
  // The regions the tour points at. Three of them no flight ever needed a handle on.
  const theirHandRef = useRef<HTMLDivElement>(null);
  // Their row measures its own box and spaces itself the way your hand does —
  // see `spreadStep`. Measured rather than assumed, since the frame is narrower
  // than its cap on most phones.
  const { ref: theirRoomRef, room: theirRoom } = useRowRoom();
  const pilesRef = useRef<HTMLDivElement>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
  const youRef = useRef<HTMLDivElement>(null);
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const [settling, setSettling] = useState(false);
  // Mirrors `settling`, synchronously. The turn-resolution effect below and
  // the deal-in effect further down both react to the same turn changing at
  // once, and a `setSettling(true)` inside the first is not visible to the
  // second within that same commit — state updates apply on a later render,
  // so the deal-in effect read whatever `settling` had been *before* this
  // transition and started right on top of it, showing this seat's new card
  // while the turn that had just resolved — the computer's own choice, on
  // its turn — was still supposed to be holding the board still. A ref
  // mutates immediately, so whichever effect runs second within the commit
  // — always the deal-in effect, since it is declared after — sees it.
  const settlingRef = useRef(false);
  // Set while this turn's own two cards are still travelling from the stock
  // to the choice pair — see the deal-in effect below.
  const [dealArriving, setDealArriving] = useState(false);
  const [dealFlights, setDealFlights] = useState<readonly Flight[]>([]);

  const pending = view.pending;

  /**
   * How far through the walkthrough this deal is.
   *
   * Started only if this is a game where a walkthrough makes sense *and* the device
   * has not been through one. Read once, on mount — which is once per draw phase, so
   * resetting it from the rules screen takes effect on the next deal rather than
   * appearing on top of the one being played.
   */
  const theirHandSize = view.handSizes[view.opponent];
  /**
   * Memoized, and not as an optimization.
   *
   * These build fresh objects on every call, so calling them during render made the
   * current step a *new object identity* every time — and the effect below, which
   * depends on the step and sets state, then re-ran on every render it had itself
   * caused. An infinite render loop, and only ever while the tour was actually on
   * screen, which is why it reached a real device: the walkthrough is the one thing
   * here that cannot be exercised by the test suite.
   */
  const lessons = drawLessons();
  const tour = drawTour();
  const [teaching, setTeaching] = useState(() => walkthrough && !walkthroughDone());
  const [tourStep, setTourStep] = useState(0);
  const [taught, setTaught] = useState(0);
  const [tourRect, setTourRect] = useState<DOMRect | null>(null);
  const turn = lastDraw?.turn ?? 0;

  // The engine hands each seat its card 1 the instant the other's turn
  // resolves. Turning one over in that same instant puts it on top of an
  // animation still running, so neither is turned over until the board is
  // still — yours here, and the computer's in the pair above.
  const shown = settling ? null : pending;
  const theirShown = settling ? null : peekPending;
  /**
   * The turn is this seat's and the board is still — but its own two cards may not
   * have arrived yet. Which is exactly the distinction the discard pile needs: that
   * card is not being dealt, it has been lying on the table since they threw it, so
   * it is face up from the moment the turn is yours and the two stock cards fly in
   * beside a choice already on offer. Gated on it turning up *last* had it arriving
   * after the cards it competes with, which is backwards.
   */
  const mineToAct = shown !== null;
  // The lesson due on this turn, if any. Keyed off the hand's own size rather than a
  // second count of turns taken: every turn nets exactly one card, kept or not, so
  // the hand *is* the count. Held back until the turn is actually this seat's, so a
  // note never lands on top of the computer thinking.
  const due = lessons[taught];
  const lesson =
    teaching && mineToAct && due !== undefined && due.turn === view.handSizes[view.me] + 1
      ? due
      : null;
  // The tour runs once, on the first turn and before any lesson: it names the parts
  // of the screen the lessons then talk about.
  const step = teaching && mineToAct && view.handSizes[view.me] === 0 ? tour[tourStep] : undefined;
  // Not decidable mid-flight, though: tapping a card still in the air would
  // resolve a turn the board has not finished dealing. Nor while a lesson of the
  // walkthrough is up — the cards then sit there unmarked and unlabelled, which
  // reads as "not yet" rather than as a tap that was ignored.
  const decidable =
    mineToAct && !dealArriving && lesson === null && step === undefined;
  // Nothing of this turn's own to show at the choice pair, in any of three
  // ways: still travelling in from the stock, already gone to the hand or
  // the discard, or — the computer's own turn, `pending` null throughout —
  // never dealt to this seat in the first place. Without the third, the
  // choice pair fell back to two plain card backs for as long as the
  // computer was deciding, which are not this seat's cards to half-show;
  // nobody's card 2 looks any different from an empty slot, but a real card
  // back sitting there reads as *something* left over from a turn already
  // gone. See `ChoiceCard`'s own doc comment for why the other two apply.
  const slotEmpty = dealArriving || settling || pending === null;

  /**
   * The rect the current tour step points at, measured after layout.
   *
   * Re-measured on every step rather than once, because the board keeps moving under
   * it — the opponent's hand row grows a card a turn and the piles change thickness.
   * `getBoundingClientRect` is already in viewport coordinates, which is what
   * `Spotlight` wants and why the hand can be found by query while everything else
   * comes from a ref.
   */
  useLayoutEffect(() => {
    if (step === undefined) {
      return;
    }
    const anchor: Record<TourTarget, HTMLElement | null> = {
      choices: choicesRef.current,
      opponent: theirHandRef.current,
      piles: pilesRef.current,
      you: youRef.current,
    };
    const element = anchor[step.target];
    if (element === null) {
      setTourRect(null);
      return;
    }
    const box = element.getBoundingClientRect();
    if (step.target !== "you") {
      setTourRect((current) => (sameRect(current, box) ? current : box));
      return;
    }
    // The hand itself is rendered by `GameBoard`, below this screen, so the last step
    // takes in whatever of it is on the page as well as the turn track — the two
    // together are "the hand you are building", and pointing at the dots alone would
    // be pointing at the smaller half.
    const cards = [...document.querySelectorAll<HTMLElement>("[data-card-id]")];
    const bottom = cards.reduce((low, card) => Math.max(low, card.getBoundingClientRect().bottom), box.bottom);
    const whole = new DOMRect(box.left, box.top, box.width, bottom - box.top);
    setTourRect((current) => (sameRect(current, whole) ? current : whole));
    // Primitives only, deliberately. Depending on the step *object* is what looped
    // this effect against itself, and `target` plus the step number is the whole of
    // what it actually reads. Their hand's size is in here because the row the first
    // step points at grows a card a turn, so a rect measured before it grew would be
    // the wrong shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep, step?.target, theirHandSize]);

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
    // `playout.duration` — this flight's own React-level cleanup — already
    // scales by pacing, so the flight itself has to travel at the same
    // scaled speed or the cleanup fires mid-flight: for a keep, mid-hold,
    // before the leg that carries card 2 away from where it was just read
    // has even started.
    const pacing = currentPacing();
    // Card 2's own two legs either side of the hold on a keep; every other
    // straight trip out of the choice pair uses `discardTravel` instead —
    // see `DRAW_TIMING.discard`'s own doc comment for why a flight with
    // nothing to hold for needs the slower, dedicated speed.
    const flightTravel = DRAW_TIMING.flight * pacing;
    const discardTravel = DRAW_TIMING.discard * pacing;
    const hold = DRAW_TIMING.hold * pacing;

    // Whoever just went, the board is busy until their turn has played out, and
    // no card 1 turns over while it is. Set for your own turn too: the engine
    // deals the computer its card the instant you tap, and without this it
    // turned face up over your own two cards still travelling.
    setSettling(true);
    settlingRef.current = true;
    timers.push(
      setTimeout(() => {
        setSettling(false);
        settlingRef.current = false;
      }, playout.duration),
    );

    // Each seat's cards leave that seat's own pair, and are drawn at that pair's
    // own size — which is the same thing the layout is saying, said again while
    // the cards are in the air.
    const size: CardSize = mine ? "table" : "mini";
    const bounds = container.getBoundingClientRect();
    const discard = centerIn(bounds, discardRef.current);
    // Yours flies to the slot it is actually about to occupy; the opponent's
    // is never shown sorted (or shown at all, without a peek), so a fixed
    // anchor is all there is to aim at. Falling back to that anchor if `pair`
    // is somehow unavailable too — nothing downstream cares which point this
    // was, only that a flight either has one or does not run at all.
    const hand = centerIn(
      bounds,
      mine ? (pair === null ? null : findHandSlot(cardId(pair.taken))) ?? mineRef.current : opponentRef.current,
    );
    const one = centerIn(bounds, mine ? oneRef.current : theirOneRef.current);
    const two = centerIn(bounds, mine ? twoRef.current : theirTwoRef.current);

    // Their turn, without their cards showing, when they lifted a card off the open
    // pile: the one card that moves is one this seat has been looking at, so it
    // travels on its own. Neither of their two is drawn, because neither is this
    // seat's to see — which is also why this cannot go through `legsFor`, whose
    // every case needs a full `DrawSpend`.
    // No pair means no legs: both of a turn's cards come off the stock, so a seat
    // that may not see them has nothing of that turn to animate at all.
    const legs = pair === null ? [] : legsFor(lastDraw.choice, pair);

    // Only the points the legs in hand actually need, which is the whole reason this
    // is resolved per leg rather than up front. `theirOneRef` and `theirTwoRef` are
    // attached by `TheirPair`, which is only on screen with the computer's cards
    // showing — so demanding every point up front dropped flights in exactly the
    // configuration anybody actually plays in.
    const from: Record<DrawLeg["source"], Point | null> = { one, two };
    const to: Record<DrawLeg["target"], Point | null> = { discard, hand };
    const placed = legs.filter((leg) => from[leg.source] !== null && to[leg.target] !== null);

    if (playout.animated && placed.length > 0 && placed.length === legs.length) {
      setFlights(
        // `placed`, not `legs`: identical here by the guard above, and it is the one
        // whose points are known non-null.
        placed.map((leg) => ({
          card: leg.card,
          delay: 0,
          fade: true,
          from: from[leg.source]!,
          hold: leg.reads ? hold : 0,
          key: `${turn}-${leg.source}`,
          size,
          to: to[leg.target]!,
          // Only a card being read gets a hold to lean on, so only it earns
          // `flightTravel`'s quicker, hold-carried legs; every other trip is
          // exactly as unaided as card 1's own.
          travel: leg.reads ? flightTravel : discardTravel,
          // A card this seat has not seen turns face up partway and stays there
          // long enough to read. It is the only chance to see it.
          via: leg.reads ? from[leg.source]! : null,
        })),
      );

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

  // This turn's own two cards, leaving the stock for the choice pair — the
  // half of the trip the pair above never showed, since it only ever
  // animated a turn's *end*. Fires again for every new card 1, including the
  // very first of the deal: unlike the resolved-turn flight above, there is
  // no reconnect to guard against replaying, since nothing here is a replay
  // of a decision already made.
  //
  // Depends on the card's *id*, not `pending` itself: that object is rebuilt
  // fresh from engine state on every render, whether or not this turn's card
  // actually changed, and depending on it directly re-ran this effect on
  // every one of those incidental renders. There is deliberately no ref
  // guarding against a repeat run on top of the id dependency, either — one
  // was tried, to skip a run already done for this card, and it is what
  // actually broke: the ref survives React's dev-mode double-invoke of a new
  // effect (mount, cleanup, mount again, to catch a missing cleanup), so the
  // second mount saw its own guard already set by the first and returned
  // without rescheduling the timer that mount's cleanup had just canceled —
  // `dealArriving` stuck at true forever, every time, in dev. The plain
  // effect below has the same shape and no such guard, and re-running its
  // whole body twice is harmless; that is the pattern to match, not improve on.
  const pendingKey = pending === null ? null : cardId(pending);
  useLayoutEffect(() => {
    // `settlingRef`, not `settling`: see its own doc comment for why the
    // state variable is a render behind within the very commit that most
    // needs it current — the one where the previous turn has *just*
    // resolved and this seat's next card is already sitting in `pending`.
    if (settlingRef.current || pending === null || pendingKey === null) {
      return;
    }

    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const bounds = container.getBoundingClientRect();
    const deck = centerIn(bounds, deckRef.current);
    const one = centerIn(bounds, oneRef.current);
    const two = centerIn(bounds, twoRef.current);
    if (deck === null || one === null || two === null) {
      return;
    }

    // Scaled the same way the resolved-turn flight above is, and for the
    // same reason: this effect's own cleanup fires on this same number, so
    // the flight has to travel at that scaled speed or the cleanup lands
    // mid-flight.
    const travel = DRAW_TIMING.flight * currentPacing();

    setDealArriving(true);
    setDealFlights([
      {
        card: pending,
        delay: 0,
        fade: false,
        from: deck,
        hold: 0,
        key: `${pendingKey}-deal-one`,
        size: "table",
        to: one,
        travel,
        via: null,
      },
      {
        card: null,
        delay: 0,
        fade: false,
        from: deck,
        hold: 0,
        key: `${pendingKey}-deal-two`,
        size: "table",
        to: two,
        travel,
        via: null,
      },
    ]);

    const timer = setTimeout(() => {
      setDealArriving(false);
      setDealFlights([]);
    }, travel);
    return () => {
      clearTimeout(timer);
    };
    // Only a newly dealt card matters; re-running on anything else would
    // replay a flight for a turn already sitting on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, settling]);

  const theirStep = spreadStep({
    available: theirRoom,
    cardWidth: CARD_WIDTHS.mini,
    count: view.handSizes[view.opponent],
    minStep: MINI_MIN_STEP,
  });

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
        {/* Their hand as a growing row of backs — except while their cards are
            showing, when the same hand is already on screen face up in the band
            above and this is the identical information with less in it. */}
        {showingTheirCards ? null : (
          // `mini`, because a card's size follows how badly a mis-tap would hurt
          // and this row cannot be tapped at all — §1.5. Drawing it at the footer
          // hand's size was tried on both screens and reverted on both: nothing
          // you cannot touch should compete with something you can, and on this
          // screen the something is the three cards on offer.
          //
          // Spaced by `spreadStep`, which is the rule your own hand follows: the
          // cards overlap only as much as they have to, so this row loosens as it
          // fills rather than sitting at its thirteen-card spacing from the first
          // turn. A fixed overlap was the one thing that still read differently
          // from your own hand. The box is full width and never changes, so the
          // row growing inside it nudges nothing above or below.
          <div ref={theirRoomRef} className="flex h-10 w-full items-center justify-center">
            {view.handSizes[view.opponent] === 0 ? (
              <span className="text-xs text-white/30">no cards yet</span>
            ) : (
              <div ref={theirHandRef} className="flex items-center">
                {Array.from({ length: view.handSizes[view.opponent] }, (_, index) => (
                  <div
                    key={index}
                    style={index === 0 ? {} : { marginLeft: theirStep - CARD_WIDTHS.mini }}
                  >
                    <CardBack size="mini" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Their side of the table, and only while their cards are showing —
            two unreadable backs would cost every deal anybody plays a strip of
            the screen to say nothing. */}
        {showingTheirCards ? (
          <TheirPair cardOne={theirShown} oneRef={theirOneRef} twoRef={theirTwoRef} />
        ) : null}

        {/* Their side, in the order yours is in. Read from the middle of the table
            outward, both sides are label, then dots, then the rule, then the hand
            — so the rule sits immediately against the hand on each side, which is
            where `GameBoard`'s footer puts yours. It separates a hand from
            everything else; anything that changed about that between the two ends
            made them disagree about what the line was for.

            Its own element rather than a border on the box above, which is what
            it was: a border there sits inside that box's padding and lands on the
            cards when the box is only as tall as they are. A 1px row in the flow
            cannot touch anything, and the column's own `gap-1` keeps it clear on
            both sides. `self-stretch` with a negative inset reaches past this
            screen's `px-4` so it runs edge to edge like the footer's. */}
        <div className="-mx-4 h-px self-stretch bg-white/10" />

        <TurnTrack choices={choicesFor(view, view.opponent)} live={false} />

        {/* Who they are and what they just did, on one line, directly under whatever
            of theirs is on screen — the pair while it is showing, the face-down hand
            otherwise. These were two bands, and the opponent's name was in both: once
            as the seat label and once as the subject of the sentence beneath it. The
            label keeps what the sentence cannot say — whose turn it is, and whether
            they are vulnerable — and the sentence finishes it as a clause.

            It also puts their label on the inward side of their own hand, mirroring
            yours at the bottom of the screen, where before one sat above its hand and
            the other below. */}
        <div className="flex min-h-10 max-w-sm flex-wrap items-center justify-center gap-x-1.5 px-4 text-center text-sm text-white/70">
          {/* Lit while they are deciding — and while the board is still settling
              after their turn, since until it does the decision is not yours. */}
          <SeatLabel
            active={view.toAct === view.opponent || settling}
            name={opponentName}
            vulnerable={vulnerable[view.opponent]}
          />
          {/* One span around the whole clause, because this is a flex container — a
              flex container makes every child its own flex item, and whitespace at an
              item's edge is trimmed exactly as it would be at a block's, so the space
              before an emphasized phrase disappeared and it read "took theunseen
              card". The clause has to be a single inline item for the spaces inside it
              to survive; `{" "}` does not help, since a whitespace-only text node
              between two items is discarded outright. The space between the label and
              the clause is `gap-x`, for the same reason. */}
          <span>
            <OpponentLine settling={settling} view={view} />
          </span>
        </div>
      </div>

      {/* Centered like every other row on this screen, rather than pinned to the
          true left and right edges: that spread the piles across the full width with
          a dead gap between them, out of step with the opponent's pair above and the
          choices below. Close together instead, the way a stock and a waste pile sit
          side by side on a real table — neither is a tap target, so proximity here can
          never be read as a choice. */}
      <div ref={pilesRef} className="flex items-start justify-center gap-6">
        <DrawDeck
          remaining={view.stockRemaining - (pending === null ? 0 : 1)}
          stackRef={deckRef}
        />
        <DiscardPile count={view.drawTurns.length} label="discarded" stackRef={discardRef} />
      </div>

      {/* The decision itself, as the sentence it is: a turn offers you these cards
          and you take one. Two under the game's own rules, one you can see and one
          you cannot; three on a house draw, the third being the pile itself rather
          than a copy of its top card — a copy would have to fly back to the pile
          every time it went untaken, animating a card that never moved.

          Under a three-card draw the third is the discard pile, in the row above:
          it is takeable from where it lies rather than being copied down here, and a
          copy would have to fly back to the pile every time it went untaken,
          animating a card that never moved. */}
      <div ref={choicesRef} className="flex items-start justify-center gap-8">
        <ChoiceCard
          card={shown}
          empty={slotEmpty}
          label={decidable ? "Face up" : null}
          slotRef={oneRef}
          onTake={
            decidable
              ? () => {
                  onDecide("first");
                }
              : null
          }
        />
        <ChoiceCard
          card={null}
          empty={slotEmpty}
          label={decidable ? "Unseen" : null}
          slotRef={twoRef}
          onTake={
            decidable
              ? () => {
                  onDecide("second");
                }
              : null
          }
        />
      </div>

      <div ref={youRef} className="flex flex-col items-center gap-1">
        <SeatLabel active={decidable} name="You" vulnerable={vulnerable[view.me]} />
        <TurnTrack choices={choicesFor(view, view.me)} live={decidable} />
      </div>

      {/* Where cards headed for a hand are aimed: yours pinned to the bottom of
          the app frame, theirs to the top. Anchors rather than the rows
          themselves, because their row is not always drawn — a flight must not
          depend on whether the thing it flies towards is currently on screen. */}
      <div ref={mineRef} className="absolute bottom-0 left-1/2 h-0 w-0" />
      <div ref={opponentRef} className="absolute top-0 left-1/2 h-0 w-0" />

      {step === undefined ? null : (
        <Spotlight
          body={step.body}
          index={tourStep}
          rect={tourRect}
          steps={tour.length}
          title={step.title}
          onNext={() => {
            const next = tourStep + 1;
            setTourStep(next);
            // Marked done when the *tour* finishes rather than when the last note is
            // dismissed. The tour is the substantial half, and somebody who walks it
            // and then leaves the deal should not be walked round the screen again.
            // The two notes still play out in this session.
            if (next >= tour.length) {
              completeWalkthrough();
            }
          }}
          // Skipping abandons the whole walkthrough, notes included. Somebody who has
          // said they do not want to be shown the screen does not want two more notes
          // about it, and it is offered again from the rules screen either way.
          onSkip={() => {
            setTeaching(false);
            completeWalkthrough();
          }}
        />
      )}

      {lesson === null ? null : (
        <DrawLessonNote
          key={lesson.turn}
          lesson={lesson}
          remaining={lessons.length - taught}
          onDone={() => {
            setTaught(taught + 1);
          }}
        />
      )}

      {flights.map((flight) => (
        <CardFlight key={flight.key} flight={flight} />
      ))}
      {dealFlights.map((flight) => (
        <CardFlight key={flight.key} flight={flight} />
      ))}
    </div>
  );
}
