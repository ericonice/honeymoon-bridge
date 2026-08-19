import { cardId } from "@hb/engine";
import type { Card, DrawChoice, DrawTake, Pair, PlayerView } from "@hb/engine";
import { motion } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import { DRAW_TIMING, currentPacing, drawPlayout } from "../game/timing.js";
import type { DrawReveal, DrawSpend } from "../game/session.js";
import { CardBack, CardFace, CardSlot } from "./CardFace.js";
import type { CardSize } from "./CardFace.js";
import { CardFlight, centerIn } from "./CardFlight.js";
import type { Flight, Point } from "./CardFlight.js";
import { CardText } from "./CardText.js";
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
 * Their choice is public even though neither of their cards is, and under the base
 * rules it is the only thing you ever learn about their hand — so it is said in
 * words as well as shown by where their cards go. Under `openDiscard` there is one
 * more thing to say and it is worth far more: which of *your* cards they just
 * picked up.
 */
function OpponentLine({
  lastDraw,
  settling,
  view,
}: {
  /** The turn that just resolved, which names their card only if they lifted it off the pile. */
  readonly lastDraw: DrawReveal | null;
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
    case "took-discard": {
      // Named as *your* card rather than as "the discard", because that is the
      // fact worth reading: a card you threw away is now in their hand. And named
      // outright while the reveal is still theirs — it was lying face up when they
      // took it, so there is nothing here to protect. Once you draw again the card
      // stops being sent and the sentence goes back to being general, which is the
      // same rule as every other reveal: it plays once, at the moment of the turn.
      const took = lastDraw !== null && lastDraw.by === view.opponent ? lastDraw.taken : null;
      return took === null ? (
        <>
          took <Chose>your discard</Chose>
        </>
      ) : (
        <>
          took your{" "}
          <Chose>
            <CardText card={took} on="dark" />
          </Chose>
        </>
      );
    }
  }
}

/**
 * The edge that marks a card as one this turn can be spent on.
 *
 * Position is what this screen uses to say what a thing is, and the choices now sit
 * in one row saying it properly — this is no longer carrying that job on its own,
 * which is what it was introduced to do while the third choice was still stranded
 * beside the stock. What is left for it is the other half: *now*. It says the board
 * has settled and the turn is yours, which is a thing the row's mere existence
 * cannot say, and it is why it appears and disappears rather than being painted on.
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
 * than from the stock, since that is where they already are — and on a
 * `took-discard` neither of them goes to a hand at all: they both land on the
 * pile, and the card that comes back the other way is the one lifted off it.
 */
interface DrawLeg {
  readonly card: Card;
  /** Held face up partway, for a card this seat has not seen before. */
  readonly reads: boolean;
  readonly source: "discard" | "one" | "two";
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
    case "took-discard": {
      return [
        { card: spend.taken, reads: false, source: "discard", target: "hand" },
        { card: spend.discarded[0]!, reads: false, source: "one", target: "discard" },
        // Card 2 was thrown without ever being looked at, so it is turned over on
        // the way out exactly as a keep's is. This is the only sight of it.
        { card: spend.discarded[1]!, reads: true, source: "two", target: "discard" },
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
  /** Whether this deal offers a third card: the top of the discard pile. */
  const openDiscard = view.rules.openDiscard;
  // Not decidable mid-flight, though: tapping a card still in the air would
  // resolve a turn the board has not finished dealing.
  const decidable = mineToAct && !dealArriving;
  // The pile is a choice only under the rule, only on your turn, and only once there
  // is something on it — every turn but the first.
  const takeableDiscard = decidable && openDiscard && view.discardTop !== null;
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
    const legs =
      pair !== null
        ? legsFor(lastDraw.choice, pair)
        : lastDraw.taken === null
          ? []
          : [{ card: lastDraw.taken, reads: false, source: "discard", target: "hand" } as DrawLeg];

    // Only the points the legs in hand actually need, which is the whole reason
    // this is resolved per leg rather than up front. `theirOneRef` and
    // `theirTwoRef` are attached by `TheirPair`, which is only on screen with the
    // computer's cards showing — so demanding all four points meant the one flight
    // that needs neither of them, the pile lift on the computer's own turn, was
    // silently dropped in exactly the configuration anybody actually plays in.
    const from: Record<DrawLeg["source"], Point | null> = { discard, one, two };
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
          // A card leaving the pile leaves at the size the pile draws it, whoever
          // is taking it — the pile is one shared object at one size, unlike the
          // two pairs, which is what `size` is otherwise saying.
          size: leg.source === "discard" ? "table" : size,
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
            <OpponentLine lastDraw={lastDraw} settling={settling} view={view} />
          </span>
        </div>
      </div>

      {/* Centered like every other row on this screen, rather than pinned to the
          true left and right edges: that spread the piles across the full width with
          a dead gap between them, out of step with the opponent's pair above and the
          choices below. Close together instead, the way a stock and a waste pile sit
          side by side on a real table.

          The discard stays here even when it is a choice. Moving it down among the
          turn's own two cards was tried — three cards abreast is "a turn offers you
          these cards and you take one" as a picture — and it is cramped across a
          phone, and it lines the pile up as a third card when it is not the same kind
          of object: it is a standing pile with a count on it that happens to have a
          takeable card on top. */}
      <div className="flex items-start justify-center gap-6">
        <DrawDeck
          remaining={view.stockRemaining - (pending === null ? 0 : 1)}
          stackRef={deckRef}
        />
        <DiscardPile
          count={view.drawTurns.length}
          edge={takeableDiscard ? TAKEABLE_EDGE : undefined}
          // A noun, and the same one for as long as the rule is on. "Discard" alone
          // was tempting and is a trap: under a card you can tap it reads as a verb,
          // and tapping this does the opposite of discarding. "Last" is exactly true —
          // turns alternate and every turn covers the pile with a card the player
          // acting threw, so what is on offer is always their most recent throw.
          label={openDiscard ? "Last discard" : "discarded"}
          stackRef={discardRef}
          // Face up from the moment the turn is this seat's — see `mineToAct`. Hidden
          // the rest of the time, which is what stopped it blinking: it used to be
          // suppressed only while a turn *played out*, and the pause before the
          // computer moves is the same length as that playout, so the card you had
          // just thrown turned face up and was covered again inside a frame.
          top={openDiscard && mineToAct ? view.discardTop : null}
          onTake={
            takeableDiscard
              ? () => {
                  onDecide("discard");
                }
              : null
          }
        />
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
      <div className="flex items-start justify-center gap-8">
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
        <CardFlight key={flight.key} flight={flight} />
      ))}
      {dealFlights.map((flight) => (
        <CardFlight key={flight.key} flight={flight} />
      ))}
    </div>
  );
}
