import { cardId } from "@hb/engine";
import type { CompletedTrick, Pair, PlayedCard, PlayerId, PlayerView } from "@hb/engine";
import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { paced, TRICK_TIMING } from "../game/timing.js";
import { CardBack, CardFace, CardSlot } from "./CardFace.js";
import { CardFlight, centerIn, centerInFromRect } from "./CardFlight.js";
import type { Flight } from "./CardFlight.js";
import { SeatLabel } from "./SeatLabel.js";

export interface PlayPhaseProps {
  /**
   * Where the card most recently played by this seat left from, captured by
   * whoever handled the tap — the hand has already lost the DOM node for it
   * by the time this screen would otherwise go looking.
   */
  readonly handOriginRef: React.RefObject<DOMRect | null>;
  /** The trick that has just resolved, still lying on the table. */
  readonly lastTrick: CompletedTrick | null;
  readonly opponentName: string;
  /**
   * Clears `GameSession.trickAwaitingDismissal`, once an ordinary trick has
   * finished sweeping itself away — on its own after `TRICK_TIMING.hold`, or
   * sooner if tapped. Not called at all for the deal's last trick — `release`
   * is what that fires instead.
   */
  onDismissTrick(): void;
  /**
   * Non-null only while this is the deal's last trick, held open rather than
   * already showing the score. It sweeps away exactly like any other trick —
   * on its own, or on a tap — and then calls this instead of `onDismissTrick`
   * — the same beat, spent leaving the phase rather than staying in it.
   */
  readonly release: (() => void) | null;
  readonly view: PlayerView;
  readonly vulnerable: Pair<boolean>;
}

interface TableTrick {
  readonly cards: readonly PlayedCard[];
  readonly winner: PlayerId | null;
}

/** How far a collected trick travels toward its winner before it fades. */
const SWEEP_DISTANCE = 130;

/**
 * What the table shows right now.
 *
 * The engine resolves a trick the instant the second card lands, so if the
 * table only ever rendered `currentTrick` you would never see the trick you
 * just lost. The resolved trick therefore stays put, is swept toward whoever
 * won it, and is gone by the time a card is played to the next one.
 */
function tableTrick(view: PlayerView, lastTrick: CompletedTrick | null): TableTrick | null {
  if (view.currentTrick.length > 0) {
    return { cards: view.currentTrick, winner: null };
  }
  if (lastTrick !== null) {
    return { cards: lastTrick.cards, winner: lastTrick.winner };
  }
  return null;
}

function Slot({
  played,
  slotRef,
  sweepTo,
  trickKey,
}: {
  readonly played: PlayedCard | undefined;
  readonly slotRef: React.RefObject<HTMLDivElement | null>;
  /** Null while the trick is still in progress; otherwise the direction it is collected in. */
  readonly sweepTo: number | null;
  readonly trickKey: string;
}): React.JSX.Element {
  return (
    <div ref={slotRef} className="relative h-24 w-16">
      <CardSlot size="table" />
      {played === undefined ? null : (
        <motion.div
          // Keyed on the trick as well as the card, so each trick's cards are
          // fresh elements and the collection animation replays every time.
          key={`${trickKey}-${cardId(played.card)}`}
          className="absolute inset-0"
          // No mount animation: this only ever appears once its own flight
          // has already arrived solid — see `CardFlight`'s `fade: false` —
          // so fading it in again on top of that would be the same blink a
          // second time, just moved from the flight's end to this one's start.
          initial={false}
          animate={
            sweepTo === null
              ? { opacity: 1, scale: 1, y: 0 }
              : { opacity: 0, scale: 0.8, y: sweepTo }
          }
          {...(sweepTo === null
            ? {}
            : { transition: { duration: paced(TRICK_TIMING.sweep) / 1000, ease: "easeIn" } })}
        >
          <CardFace card={played.card} size="table" />
        </motion.div>
      )}
    </div>
  );
}

/**
 * Their hand, as a row of backs rather than nothing at all.
 *
 * A played card used to leave from an invisible point sitting right on top of
 * the seat label — barely any distance from the slot it was headed to, which
 * read as a flick rather than a card leaving a hand. This gives it an actual
 * hand to leave from, sized to how many cards are still in it, and doubles as
 * the flight's origin: `centerIn` addresses the whole row, not any one card in
 * it, so which of the thirteen just left is never something the animation
 * could be read for.
 */
function OpponentHand({
  count,
  rowRef,
}: {
  readonly count: number;
  readonly rowRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  return (
    <div ref={rowRef} className="flex h-10 items-center justify-center">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={index > 0 ? "-ml-4" : ""}>
          <CardBack size="mini" />
        </div>
      ))}
    </div>
  );
}

/**
 * The card most recently played, and by whom — or null before the first one.
 *
 * The engine resolves a trick the instant its second card lands, so a card
 * that just completed one is never sitting in `currentTrick`: it has already
 * moved into the newest `completedTricks` entry. `leader` says who led that
 * trick, so whichever of its two cards was played by the *other* seat is the
 * one that just landed.
 */
function justPlayed(view: PlayerView): PlayedCard | null {
  if (view.currentTrick.length === 1) {
    return view.currentTrick[0]!;
  }
  if (view.currentTrick.length === 0 && view.completedTricks.length > 0) {
    const last = view.completedTricks[view.completedTricks.length - 1]!;
    return last.cards.find((played) => played.by !== last.leader) ?? null;
  }
  return null;
}

/**
 * What you have to do, when it is your move.
 *
 * No longer says *whose* turn it is — the seat labels carry that now. This is
 * only for the part a name cannot tell you: whether you are leading or have to
 * follow a suit.
 */
function instruction(view: PlayerView): string | null {
  // There is nothing left to do once the deal is over. The board goes on
  // showing this screen for a beat so the thirteenth trick can be collected,
  // and the engine has already handed the lead on by then — so without this it
  // asks for a card that no longer exists.
  if (view.phase !== "play" || view.toAct !== view.me) {
    return null;
  }
  return view.currentTrick.length === 0 ? "Your lead" : "Follow suit";
}

/**
 * A claim in progress reads as neither a lead nor a follow — `toAct` has
 * moved to whoever is deciding it, so without this the claimant would see
 * nothing at all where "your lead"/"follow suit" would otherwise be, and a
 * claim they just made would look identical to an ordinary turn they are
 * waiting out.
 */
function claimStatus(view: PlayerView): string | null {
  return view.claim === view.me ? "Waiting for them to decide" : null;
}

export function PlayPhase({
  handOriginRef,
  lastTrick,
  onDismissTrick,
  opponentName,
  release,
  view,
  vulnerable,
}: PlayPhaseProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const opponentHandRef = useRef<HTMLDivElement>(null);
  const opponentSlotRef = useRef<HTMLDivElement>(null);
  const mySlotRef = useRef<HTMLDivElement>(null);
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  // Whichever seat's card is still in the air. The slot it is headed for
  // must not show that seat's card until this clears — the slot's own reveal
  // used to run on its own fixed 180ms regardless of the flight above it, so
  // once the flight took longer than that the real card was sitting there,
  // fully arrived, well before the thing that was supposed to bring it did.
  const [pendingBy, setPendingBy] = useState<PlayerId | null>(null);
  // Set once a resolved trick starts sweeping itself away — on its own after
  // `TRICK_TIMING.hold`, or the moment it is tapped if that comes first.
  // Requiring the tap was tried and cost more than the early-vanish bug it
  // fixed: thirteen required taps a deal, every one of them a chance to feel
  // like busywork on a trick nobody needed a second look at.
  const [sweeping, setSweeping] = useState(false);
  const sweepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whatever this screen mounted showing — mid-deal on a reconnect, same as a
  // fresh one — is not a card that just landed, so the first run only records
  // it rather than replaying it.
  const mountedAt = useRef<number | null>(null);

  const trick = tableTrick(view, lastTrick);
  const cards = trick?.cards ?? [];
  // The engine resolves a trick — and so `trick.winner` — the instant its
  // second card lands in state, which is well before that card is done
  // arriving on screen. `pendingBy` is what makes this wait for the arrival
  // rather than the resolution: sweeping a trick still visibly in flight
  // would have nothing correct to sweep.
  const resolved = trick !== null && trick.winner !== null && pendingBy === null;

  // Both cards travel the same way — toward whoever took them — but only
  // once the wait is actually over, however it ended. Before that, a
  // resolved trick just sits there.
  const sweepTo = !sweeping || trick === null ? null : trick.winner === view.me ? SWEEP_DISTANCE : -SWEEP_DISTANCE;

  const trickKey = `${view.completedTricks.length}-${resolved ? "done" : "live"}`;

  // Neither seat is on turn once the deal is over, so both go quiet while the
  // last trick is collected rather than one of them claiming a move to make.
  const live = view.phase === "play";
  const yourTurn = live && view.toAct === view.me;

  // Strictly increasing by exactly one a card, whichever seat played it and
  // however the engine just filed it away — see `justPlayed`.
  const playedCount = view.completedTricks.length * 2 + view.currentTrick.length;

  useLayoutEffect(() => {
    // A new card landing is always the far side of a dismissed trick, mine or
    // theirs — never something still waiting on a tap of its own.
    setSweeping(false);

    if (mountedAt.current === null) {
      mountedAt.current = playedCount;
      return;
    }

    const container = containerRef.current;
    const played = justPlayed(view);
    if (container === null || played === null) {
      return;
    }

    const mine = played.by === view.me;
    const bounds = container.getBoundingClientRect();
    const to = centerIn(bounds, mine ? mySlotRef.current : opponentSlotRef.current);
    // Yours leaves from wherever it actually sat in your hand — captured by
    // whoever handled the tap, since the hand has already lost that card by
    // now. Theirs is never anything more specific than the row of backs as a
    // whole — see `OpponentHand`.
    const from = mine
      ? centerInFromRect(bounds, handOriginRef.current)
      : centerIn(bounds, opponentHandRef.current);
    if (to === null || from === null) {
      return;
    }

    const key = `${playedCount}-${cardId(played.card)}`;
    const travel = paced(TRICK_TIMING.play);
    setPendingBy(played.by);
    setFlights([
      {
        card: played.card,
        delay: 0,
        fade: false,
        from,
        hold: 0,
        key,
        size: "table",
        to,
        travel,
        via: null,
      },
    ]);

    const timer = setTimeout(() => {
      setPendingBy(null);
      setFlights([]);
    }, travel);
    return () => {
      clearTimeout(timer);
    };
    // Only a new card landing matters; re-running on anything else would
    // replay a flight for one that already has.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playedCount]);

  // Sweeps a resolved trick away, then hands the beat on to whichever of
  // `release`/`onDismissTrick` is this trick's to fire — see their own doc
  // comments for which and why. Shared by the hold timer below and a tap,
  // since either is just a different reason the wait is over.
  function startSweep(): void {
    if (!resolved || sweeping) {
      return;
    }
    setSweeping(true);
    sweepTimer.current = setTimeout(() => {
      sweepTimer.current = null;
      if (release !== null) {
        release();
      } else {
        onDismissTrick();
      }
    }, paced(TRICK_TIMING.sweep));
  }

  // The ordinary way out: nobody has to do anything, once a trick has had its
  // stage time. A tap during this window just cuts it short.
  useEffect(() => {
    if (!resolved) {
      return;
    }
    const timer = setTimeout(startSweep, paced(TRICK_TIMING.hold));
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  useEffect(() => {
    return () => {
      if (sweepTimer.current !== null) {
        clearTimeout(sweepTimer.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-1 flex-col items-center justify-center gap-3"
      onClick={startSweep}
    >
      <SeatLabel
        active={live && !yourTurn}
        name={opponentName}
        vulnerable={vulnerable[view.opponent]}
      />
      <OpponentHand count={view.handSizes[view.opponent]} rowRef={opponentHandRef} />
      <Slot
        played={pendingBy === view.opponent ? undefined : cards.find((played) => played.by === view.opponent)}
        slotRef={opponentSlotRef}
        sweepTo={sweepTo}
        trickKey={trickKey}
      />

      <div className="flex min-h-10 flex-col items-center justify-center">
        {claimStatus(view) !== null ? (
          <p className="text-center text-sm text-amber-200/70">{claimStatus(view)}</p>
        ) : instruction(view) !== null ? (
          <p className="text-center text-sm text-white/50">{instruction(view)}</p>
        ) : null}
      </div>

      <Slot
        played={pendingBy === view.me ? undefined : cards.find((played) => played.by === view.me)}
        slotRef={mySlotRef}
        sweepTo={sweepTo}
        trickKey={trickKey}
      />
      <SeatLabel active={yourTurn} name="You" vulnerable={vulnerable[view.me]} />

      {flights.map((flight) => (
        <CardFlight key={flight.key} flight={flight} />
      ))}
    </div>
  );
}
