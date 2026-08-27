import { cardId } from "@hb/engine";
import type {
  Card,
  CompletedTrick,
  DealScore,
  Pair,
  PlayedCard,
  PlayerId,
  PlayerView,
  TrickOutlook,
} from "@hb/engine";
import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { declaringIn, outlookFor } from "../game/outlook.js";
import { paced, TRICK_TIMING } from "../game/timing.js";
import { CardBack, CardFace, CardSlot } from "./CardFace.js";
import { CardFlight, centerIn, centerInFromRect } from "./CardFlight.js";
import type { Flight } from "./CardFlight.js";
import { CARD_WIDTHS, Hand, MINI_MIN_STEP, spreadStep, useRowRoom } from "./Hand.js";
import { DealResultHeadline } from "./ScoreRows.js";
import { SeatLabel } from "./SeatLabel.js";
import { TrickRing, trickRingLabel } from "./TrickRing.js";

export interface PlayPhaseProps {
  /**
   * This deal's score, shown alongside `revealedHands` — see
   * `DealResultHeadline`. Null on anything shorter than a full scored deal,
   * which is exactly when `revealedHands` is null too.
   */
  readonly dealScore: DealScore | null;
  /** What a duplicate deal paid beyond its tricks. Zero in a rubber. */
  readonly dealBonus: number;
  /**
   * Where the card most recently played by this seat left from, captured by
   * whoever handled the tap — the hand has already lost the DOM node for it
   * by the time this screen would otherwise go looking.
   */
  readonly handOriginRef: React.RefObject<DOMRect | null>;
  /** The trick that has just resolved, still lying on the table. */
  readonly lastTrick: CompletedTrick | null;
  /**
   * Taken instead of `release`, once both hands are showing, for any deal
   * that does not also finish the rubber — see `GameBoard`. Deals straight
   * into the next hand rather than a screen with one more button on it,
   * since there is nothing left this one has to say that revealing both
   * hands and this deal's own result did not already say. Null when the
   * rubber just finished with this deal, where the next thing to decide is
   * a new rubber rather than a new hand, and that stays its own screen.
   */
  readonly onContinue: (() => void) | null;
  readonly opponentName: string;
  /**
   * True once the other player has asked to move on and you have not —
   * the mirror of `waitingToContinue`, shown here for the same reason
   * `DealComplete` used to show it: without it, a hand you are still
   * looking at reads the same whether or not somebody is sitting there
   * waiting on you. Always false against the computer.
   */
  readonly opponentWaitingToContinue: boolean;
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
   * on its own, or on a tap — and then calls this instead of `onDismissTrick`.
   * Once hands are revealed, `onContinue` is what a tap fires instead of this
   * whenever it is on offer — see its own doc comment for when it is not.
   */
  readonly release: (() => void) | null;
  /**
   * Both hands as they stood for this deal, once the last one is known —
   * see `finishedHandsFor`. Null until then, and always null for a claimed
   * finish, which never has a complete pair to show.
   *
   * Shown in exactly the spot each hand has occupied all game: the
   * opponent's own row here, face up instead of face down, and this seat's
   * own in the footer below (`GameBoard`'s to fill in, not this component's
   * — the footer is never this component's to draw). This is also what the
   * trick slots and `PlayToolbar` clear away for, once it starts showing —
   * see `onHandsSettled` — since neither has anything left to be about.
   *
   * Held back from view until the last trick has actually swept away.
   * Showing both at once, before the table had cleared, read as the reveal
   * arriving ahead of the trick it was supposedly waiting on.
   */
  readonly revealedHands: Pair<readonly Card[]> | null;
  /**
   * Fires exactly once the deal's last trick has cleared away and
   * `revealedHands` starts actually being shown in this seat's own row.
   * `GameBoard` uses it to hold the footer's reveal to the same instant —
   * two reveals that started at different times would not read as one.
   */
  onHandsSettled?(): void;
  /** Whether to draw the opponent's trick countdown — see `TrickRing`. */
  readonly trickCount: boolean;
  readonly view: PlayerView;
  readonly vulnerable: Pair<boolean>;
  /**
   * True once you have asked to move on and the other player has not.
   * Always false against the computer, which has nothing to read and
   * nobody to keep waiting.
   */
  readonly waitingToContinue: boolean;
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
  ring,
  slotRef,
  sweepTo,
  trickKey,
}: {
  readonly played: PlayedCard | undefined;
  /**
   * This slot's owner's trick countdown, or null. Anchored to the slot rather
   * than to the row it sits in: out at the row's right edge the ring reads as
   * unattached to anything, where eight pixels off the card it plainly belongs
   * to the seat whose card that is.
   */
  readonly ring: React.ReactNode;
  readonly slotRef: React.RefObject<HTMLDivElement | null>;
  /** Null while the trick is still in progress; otherwise the direction it is collected in. */
  readonly sweepTo: number | null;
  readonly trickKey: string;
}): React.JSX.Element {
  return (
    <div ref={slotRef} className="relative h-24 w-16">
      <CardSlot size="table" />
      {ring === null ? null : (
        <div className="absolute top-1/2 -right-8 -translate-y-1/2">{ring}</div>
      )}
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
 * Their hand, as a row of backs rather than nothing at all — or, once
 * `revealed` is given, that same row turned face up.
 *
 * A played card used to leave from an invisible point sitting right on top of
 * the seat label — barely any distance from the slot it was headed to, which
 * read as a flick rather than a card leaving a hand. This gives it an actual
 * hand to leave from, sized to how many cards are still in it, and doubles as
 * the flight's origin: `centerIn` addresses the whole row, not any one card in
 * it, so which of the thirteen just left is never something the animation
 * could be read for.
 *
 * `revealed` is the same row rather than a second one: by the deal's last
 * trick this hand is down to nothing, so the count-of-backs it would
 * otherwise show is empty anyway. Filling it with the full thirteen, face up,
 * in the exact spot that had just been counting down to zero, is what makes
 * the reveal read as more of the same screen rather than a new one.
 *
 * **The face-down row is `mini` and the revealed one is not, and that difference
 * is the point rather than an oversight.** Drawing the backs at the footer hand's
 * size was tried and reverted: a face-down row carries exactly one fact, how many
 * cards they have left, and `mini` carries it. At full size it becomes a
 * thirteen-card block of card-back pattern across the top, as loud as your own
 * hand, competing with the trick in the middle for attention while saying nothing
 * you need — your hand has to be readable card by card because you are choosing
 * from it, and theirs is a count.
 *
 * The jump in size at the reveal was the argument *for* matching them and is
 * actually the argument against: before the reveal their cards are a number,
 * after it they are information, and the size changing is what marks the moment
 * that stops being true. §1.3's draw screen is the other way round — there their
 * hand growing is the subject of the screen, so it is drawn at full size.
 */
function OpponentHand({
  count,
  revealed,
  rowRef,
}: {
  readonly count: number;
  readonly revealed: readonly Card[] | null;
  readonly rowRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  const { ref: roomRef, room } = useRowRoom();

  if (revealed !== null) {
    return (
      <div ref={rowRef} className="w-full">
        <Hand cards={revealed} highlight={null} onPlay={null} playable={null} tapToSelect={false} />
      </div>
    );
  }
  // The same rule your own hand follows — see `spreadStep`. A fixed overlap made
  // this row get shorter as it emptied where yours got looser, which is the one
  // thing about the two that read as different kinds of object.
  const step = spreadStep({
    available: room,
    cardWidth: CARD_WIDTHS.mini,
    count,
    minStep: MINI_MIN_STEP,
  });

  return (
    <div ref={roomRef} className="relative flex h-10 w-full items-center justify-center">
      <div ref={rowRef} className="flex items-center">
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            style={index === 0 ? {} : { marginLeft: step - CARD_WIDTHS.mini }}
          >
            <CardBack size="mini" />
          </div>
        ))}
      </div>
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
 * Says nothing about *whose* turn it is — the seat labels carry that. And nothing
 * about following suit either, which it used to: the hand already refuses to play
 * a card that would not follow, so the words were restating a rule the cards were
 * enforcing, on the majority of turns in a deal, for no one who did not already
 * know. The lead is the one case worth a line — §1.6 calls it the rule people most
 * reliably have backwards — so this is now empty except on the turns that have it.
 */
function instruction(view: PlayerView): string | null {
  // There is nothing left to do once the deal is over. The board goes on
  // showing this screen for a beat so the thirteenth trick can be collected,
  // and the engine has already handed the lead on by then — so without this it
  // asks for a card that no longer exists.
  if (view.phase !== "play" || view.toAct !== view.me || view.currentTrick.length > 0) {
    return null;
  }
  return "Your lead";
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
  dealBonus,
  dealScore,
  handOriginRef,
  lastTrick,
  onContinue,
  onDismissTrick,
  onHandsSettled,
  opponentName,
  opponentWaitingToContinue,
  release,
  revealedHands,
  trickCount,
  view,
  vulnerable,
  waitingToContinue,
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
  // Only meaningful once `revealedHands` is showing: true once this trick's
  // own sweep has finished clearing it away, so a further tap knows there is
  // nothing left to sweep and reads as leaving the reveal instead.
  const [swept, setSwept] = useState(false);
  const sweepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whatever this screen mounted showing — mid-deal on a reconnect, same as a
  // fresh one — is not a card that just landed, so the first run only records
  // it rather than replaying it.
  const mountedAt = useRef<number | null>(null);

  // Both rings, each beside the card its own seat just played — so which is whose
  // is answered by position and needs no label or colour of its own. They were on
  // the two hand rows first, which put them at the edges of a screen nobody looks
  // at between tricks; a ring changes exactly when a trick resolves, which is the
  // one moment the eye is certainly on these two cards.
  //
  // **Not gated on `view.phase`, which is the bug that shipped.** The engine
  // completes the deal the instant the thirteenth card lands, so a contract made
  // or set on the last trick flipped the phase and unmounted both rings in the
  // same render that would have drawn the check — the one deal in every rubber
  // where it is settled at the last possible moment never showed it settle.
  //
  // This component is only ever rendered while the *shown* phase is "play", and
  // that is the right window: it stays open for the last trick's hold and its
  // sweep, so the check lands with the trick that earned it. What ends the rings
  // is the slots themselves unmounting once both hands are face up, where the
  // result is stated in full and a countdown has nothing left to say.
  const counting = trickCount && view.contract !== null;
  const rings: Pair<TrickOutlook | null> = [
    counting ? outlookFor(view, 0) : null,
    counting ? outlookFor(view, 1) : null,
  ];

  function ringFor(seat: PlayerId): React.ReactNode {
    const outlook = rings[seat];
    if (outlook === null) {
      return null;
    }
    return (
      <>
        <TrickRing outlook={outlook} />
        <span className="sr-only">
          {trickRingLabel({
            declaring: declaringIn(view, seat),
            mine: seat === view.me,
            outlook,
          })}
        </span>
      </>
    );
  }

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
    setSwept(false);

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
  //
  // While hands are being revealed, sweeping is as far as this takes it:
  // `handleTap` is what actually leaves from there. The deal's last trick
  // still clears itself away on its own stage time, same as any other — it
  // is only the reveal sitting behind it that a tap, not a timer, ends.
  function startSweep(): void {
    if (!resolved || sweeping) {
      return;
    }
    setSweeping(true);
    sweepTimer.current = setTimeout(() => {
      sweepTimer.current = null;
      if (revealedHands !== null) {
        setSwept(true);
        onHandsSettled?.();
        return;
      }
      if (release !== null) {
        release();
      } else {
        onDismissTrick();
      }
    }, paced(TRICK_TIMING.sweep));
  }

  // What a tap on the table means: cut the current wait short, whichever wait
  // that is. Before this trick has swept, that is `startSweep`'s to decide,
  // same as ever. Once it has — only reachable while hands are being
  // revealed, since every other trick's sweep already left by this point —
  // it is this seat saying it has seen enough of both hands, which
  // `onContinue` takes straight into the next one wherever that is on offer.
  // Already having said so once is not a second tap's to say again.
  function handleTap(): void {
    if (revealedHands !== null && swept) {
      if (waitingToContinue) {
        return;
      }
      if (onContinue !== null) {
        onContinue();
      } else if (release !== null) {
        release();
      } else {
        onDismissTrick();
      }
      return;
    }
    startSweep();
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
      onClick={handleTap}
    >
      {/* Their side, in the order yours is in — read from the middle of the table
          outward, both are label, then the rule, then the hand. Their label used
          to sit above their hand, which put the rule on the far side of it and
          made the two ends of the table disagree about what the line separates.
          It separates a hand from everything else, on both sides.

          Their hand is therefore the outermost thing on their side, exactly as
          yours is on yours — see `GameBoard`'s footer, which draws this same
          hairline immediately above your own thirteen. */}
      <OpponentHand
        count={view.handSizes[view.opponent]}
        revealed={swept ? (revealedHands?.[view.opponent] ?? null) : null}
        rowRef={opponentHandRef}
      />

      {/* Its own element rather than a border on a box wrapping the hand, which
          is what it was: a border there sits inside that box's padding and lands
          on the cards when the box is only as tall as they are. A 1px row in the
          flow cannot touch anything, and this column's `gap-3` keeps it clear. */}
      <div className="h-px w-full bg-white/10" />

      <SeatLabel
        active={live && !yourTurn}
        name={opponentName}
        vulnerable={vulnerable[view.opponent]}
      />
      {/* The trick slots are only worth looking at while there is something
          in them or about to be — once hands are revealed there is nothing
          left to hold a slot open for, so they simply stop rendering rather
          than sitting there empty. */}
      {swept && revealedHands !== null ? null : (
        <Slot
          played={pendingBy === view.opponent ? undefined : cards.find((played) => played.by === view.opponent)}
          ring={ringFor(view.opponent)}
          slotRef={opponentSlotRef}
          sweepTo={sweepTo}
          trickKey={trickKey}
        />
      )}

      {/* Gated on `swept`, like every other part of the reveal on this screen.
          `revealedHands` alone is not the same moment: it goes non-null the
          instant the thirteenth card lands, so the headline and its score columns
          used to appear *while the last trick was still on the table* — several
          lines arriving in a band that had been holding one, which pushed the
          played cards and the hand below them visibly down.

          There is nothing to say in that gap: the phase is over, so no lead or
          claim line is due either, and `min-h-10` is already the height of the one
          line this band was holding. So the trick sits undisturbed for its own
          stage time, and then the hands turning face up, the slots clearing and
          this headline all happen together — which is what they were always
          meant to read as. */}
      <div className="flex min-h-10 flex-col items-center justify-center gap-2">
        {!swept || revealedHands === null || dealScore === null ? (
          claimStatus(view) !== null ? (
            <p className="text-center text-sm text-amber-200/70">{claimStatus(view)}</p>
          ) : instruction(view) !== null ? (
            <p className="text-center text-sm text-white/50">{instruction(view)}</p>
          ) : null
        ) : (
          <>
            <DealResultHeadline
              bonus={dealBonus}
              opponentName={opponentName}
              score={dealScore}
              view={view}
              vulnerable={vulnerable}
            />
            <p className="text-center text-sm text-white/50">
              {waitingToContinue ? `Waiting for ${opponentName}…` : "Tap to continue"}
            </p>
            {/* The mirror of the line above — without it, a hand somebody
                else is still sitting on reads the same as one nobody is. */}
            {opponentWaitingToContinue && !waitingToContinue ? (
              <p className="text-center text-xs text-white/40">{opponentName} is ready</p>
            ) : null}
          </>
        )}
      </div>

      {swept && revealedHands !== null ? null : (
        <Slot
          played={pendingBy === view.me ? undefined : cards.find((played) => played.by === view.me)}
          ring={ringFor(view.me)}
          slotRef={mySlotRef}
          sweepTo={sweepTo}
          trickKey={trickKey}
        />
      )}
      {/* Labels whose hand is below it — meaningful for the opponent's, up
          top, since that hand only just turned face up. Not for this one:
          it has sat in the same footer all game, and by the time hands are
          revealed there is no active turn left for the dot to mean either. */}
      {swept && revealedHands !== null ? null : (
        <SeatLabel active={yourTurn} name="You" vulnerable={vulnerable[view.me]} />
      )}

      {flights.map((flight) => (
        <CardFlight key={flight.key} flight={flight} />
      ))}
    </div>
  );
}
