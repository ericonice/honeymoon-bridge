import { cardId, sameCard } from "@hb/engine";
import type { Card } from "@hb/engine";
import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { spokenCardLabel } from "../game/labels.js";
import { DRAW_TIMING, currentPacing } from "../game/timing.js";
import { CardFace } from "./CardFace.js";

/** Matches the `hand` size in `CardFace`. */
const CARD_WIDTH = 56;

/**
 * This component's total resting height, empty or full — the card height
 * (`h-20`, 80px) plus the row's own top padding (`pt-9`, 36px, which is
 * headroom for a previewed card's rise and scale, not decoration) plus the
 * frame's bottom padding (`pb-1`, 4px).
 *
 * `GameBoard` holds a placeholder of exactly this height in place of a
 * genuinely empty hand at the end of play, rather than letting the footer
 * disappear the instant the last card is played — which is several beats
 * before the screen actually leaves the play phase, and unmounting it early
 * that way was a layout jump with a clear board above and empty space below
 * where the footer used to be. Keep this in sync with the JSX below and with
 * `GameBoard`'s own footer if either changes.
 */
export const HAND_HEIGHT = 80 + 36 + 4;

/** Never squeeze a card's exposed strip below this, or the index becomes unreadable. */
export const MIN_STEP = 18;

/**
 * What an emphasized card aims for: iOS's minimum comfortable tap target.
 * Asking for the full card width instead would only be scaled back down, and
 * would take the width out of the tight cards it is supposed to be borrowing
 * from.
 */
const LEGAL_STEP = 44;

/** What a de-emphasized card gets, since it only has to be identifiable, not tappable. */
const TIGHT_STEP = 20;

/** The `px-3` on the scroll frame, which `clientWidth` includes. */
const FRAME_PADDING = 24;

/** The `hand` and `mini` card widths in `CardFace`, which the spacing is set in terms of. */
export const CARD_WIDTHS = { hand: CARD_WIDTH, mini: 28 } as const;

/**
 * The narrowest strip of a `mini` card worth showing — proportionally what
 * `MIN_STEP` is to a full-size one. Lower than that floor because these rows are
 * read rather than tapped: a face-down back only has to look like a separate
 * card, and a small face-up hand is being counted rather than picked from.
 */
export const MINI_MIN_STEP = 10;

/**
 * How far apart a row of face-down cards sits, given the room it has.
 *
 * **This is the rule your own hand follows, stated so a row of backs can follow
 * it too.** Cards overlap only as much as they have to, so a row spreads out as
 * it empties rather than staying bunched at its thirteen-card spacing — and a
 * row that grows spreads the other way. The opponent's hand used a fixed overlap
 * and so behaved visibly differently from yours: it got shorter as it emptied
 * where yours got looser, which reads as two different kinds of object rather
 * than as two hands.
 *
 * `minStep` is the floor, since a strip too narrow to see stops reading as a
 * separate card at all. Below it the row is allowed to be wider than the room
 * and clip, which is the same thing `stepsFor` does and for the same reason:
 * illegible is worse than cut off.
 */
export function spreadStep({
  available,
  cardWidth,
  count,
  minStep,
}: {
  readonly available: number;
  readonly cardWidth: number;
  readonly count: number;
  readonly minStep: number;
}): number {
  if (count <= 1) {
    return cardWidth;
  }
  const fits = (available - cardWidth) / (count - 1);
  return Math.max(minStep, Math.min(cardWidth, fits));
}

/**
 * A ref to put on a row's container, and how wide that container currently is.
 *
 * Measured rather than assumed, and remeasured on rotation and on the
 * keyboard-driven viewport changes iOS makes. Shared because three rows need it
 * — your hand, and the opponent's on each of the two screens that draw one —
 * and a magic number for the app frame's width would be wrong on every phone
 * narrower than the cap.
 */
export function useRowRoom(): {
  readonly ref: React.RefObject<HTMLDivElement | null>;
  readonly room: number;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(320);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const measure = (): void => {
      setRoom(element.clientWidth);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { ref, room };
}

/**
 * How far each card sits from the one before it — which is exactly how much of
 * the previous card stays visible, and therefore how big its tap target is.
 *
 * Cards only overlap as much as they have to, so a hand spreads out as it is
 * played away rather than staying bunched at its thirteen-card spacing. Only
 * the follow-suit rule redistributes that space, though — a card pressed
 * during an unrestricted lead is called out by scaling up in place instead,
 * so the rest of the hand never has to shift or shrink around it.
 */
function stepsFor(
  cards: readonly Card[],
  emphasize: ((card: Card) => boolean) | null,
  available: number,
): number[] {
  if (cards.length <= 1) {
    return [];
  }

  const emphasized = (card: Card): boolean => emphasize !== null && emphasize(card);
  const restricted = emphasize !== null && cards.some((card) => !emphasized(card));

  // Nothing to emphasize means every gap is the same, which is `spreadStep`'s
  // whole job — so it is called rather than recomputed, and the opponent's row
  // and yours cannot drift apart.
  if (!restricted) {
    const step = spreadStep({
      available,
      cardWidth: CARD_WIDTH,
      count: cards.length,
      minStep: MIN_STEP,
    });
    return cards.slice(1).map(() => step);
  }

  // `steps[i]` is the gap before card i + 1, so it is the exposure of card i.
  let steps: number[] = cards
    .slice(1)
    .map((_, index) => (emphasized(cards[index]!) ? LEGAL_STEP : TIGHT_STEP));

  const width = (list: number[]): number => CARD_WIDTH + list.reduce((sum, s) => sum + s, 0);

  if (width(steps) > available) {
    // Shrink what is left proportionally rather than uniformly, so the tight
    // cards stay tight and the emphasized ones keep the advantage.
    const slack = available - CARD_WIDTH;
    const wanted = width(steps) - CARD_WIDTH;
    const scale = wanted === 0 ? 1 : slack / wanted;
    steps = steps.map((step) => Math.max(MIN_STEP, step * scale));
  }

  return steps;
}

export interface HandProps {
  readonly cards: readonly Card[];
  /**
   * The card most recently added, marked so it can be found.
   *
   * The hand is displayed sorted, so a card taken sight-unseen slots in among
   * twelve others with nothing to say it was the one that just arrived.
   */
  readonly highlight: Card | null;
  /**
   * The cards the follow-suit rule permits right now, or null outside the play
   * phase.
   *
   * A press picks the nearest legal card and calls it out — brought in front
   * of its neighbors and scaled up rather than moved, so nothing else in the
   * hand has to shrink or shift to make room. Sliding while still pressed can
   * move that pick to a different card, and whatever is called out when the
   * finger lifts is what plays. No separate confirmation step: press, aim,
   * release.
   *
   * `tapToSelect` keeps that same press-aim-release tracking — a press still
   * retargets live as it slides, so landing on the card next to the one
   * already raised is no harder than it ever was — but changes what release
   * does with it: release plays only if it lands back on the card that was
   * already raised before this press began; landing on any other card just
   * moves the raise there, and it stays raised across separate taps instead
   * of dropping the instant the finger lifts.
   */
  readonly playable: readonly Card[] | null;
  readonly onPlay: ((card: Card) => void) | null;
  readonly tapToSelect: boolean;
}

export function Hand({
  cards,
  highlight,
  onPlay,
  playable,
  tapToSelect,
}: HandProps): React.JSX.Element {
  const { ref: frameRef, room: available } = useRowRoom();
  const rowRef = useRef<HTMLDivElement>(null);
  // The card currently raised — set on pointer down, retargeted live on
  // pointer move, and whatever it holds when the pointer lifts is what plays
  // in the default gesture. Under `tapToSelect` it persists between separate
  // taps instead of dropping on release; what release does with it depends
  // on `raisedBeforePress`, below.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  // What `previewIndex` held before the press now in progress started —
  // captured on pointer down, ahead of the live retargeting that follows,
  // since by pointer up `previewIndex` has already become the release
  // target and there would be nothing left to compare it against. Only
  // `tapToSelect` reads this; the default gesture always plays whatever is
  // raised on release regardless of what was raised before.
  const raisedBeforePress = useRef<number | null>(null);

  const isLegal = (card: Card): boolean =>
    playable !== null && playable.some((allowed) => sameCard(allowed, card));
  const restrictedByRule = playable !== null && cards.some((card) => !isLegal(card));

  // A card left over from a previous trick should not start already raised
  // before anything has been touched this time.
  useEffect(() => {
    setPreviewIndex(null);
  }, [cards.length]);

  // The previewed card no longer feeds into this: it used to widen in place,
  // which meant its neighbors had to shrink to pay for it. Calling it out
  // with scale and stacking order instead means the rest of the hand's
  // layout never depends on what is currently pressed.
  const emphasize = restrictedByRule ? isLegal : null;

  const steps = stepsFor(cards, emphasize, available - FRAME_PADDING);

  const lefts: number[] = [0];
  for (const step of steps) {
    lefts.push(lefts[lefts.length - 1]! + step);
  }

  // Only legal cards are candidates, so a press can never raise a card that
  // does nothing on release — the follow-suit rule already ruled it out.
  //
  // Distance is measured to the middle of what is actually *visible* of a
  // card — `steps[index]`, the exposure defined above, or its full width for
  // the last card, which nothing overlaps — not to the middle of its full
  // footprint. Once a hand does not fit at full spacing, every card but the
  // last has most of its width covered by the card in front of it, so the
  // full-footprint center sits well into that next card's territory. A tap
  // anywhere on a card's visible sliver would then often measure closer to
  // that overstated center than to the card's own, and resolve to the card
  // behind it instead — worse the tighter the overlap, which is exactly where
  // a precise tap matters most.
  const nearestLegalIndex = (x: number): number | null => {
    let best: number | null = null;
    let bestDistance = Infinity;
    cards.forEach((card, index) => {
      if (!isLegal(card)) {
        return;
      }
      const exposed = steps[index] ?? CARD_WIDTH;
      const distance = Math.abs(x - (lefts[index]! + exposed / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  };

  const updatePreview = (clientX: number): void => {
    const row = rowRef.current;
    if (row === null) {
      return;
    }
    setPreviewIndex(nearestLegalIndex(clientX - row.getBoundingClientRect().left));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (onPlay === null || activePointerId.current !== null) {
      return;
    }
    activePointerId.current = event.pointerId;
    raisedBeforePress.current = previewIndex;
    updatePreview(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (activePointerId.current !== event.pointerId) {
      return;
    }
    updatePreview(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (activePointerId.current !== event.pointerId) {
      return;
    }
    activePointerId.current = null;
    if (tapToSelect) {
      // `previewIndex` already holds wherever this press last aimed, tracked
      // live by the move handler above exactly as the default gesture does —
      // only what release does with it differs.
      if (previewIndex !== null && previewIndex === raisedBeforePress.current) {
        onPlay?.(cards[previewIndex]!);
        setPreviewIndex(null);
      }
      return;
    }
    if (previewIndex !== null) {
      onPlay?.(cards[previewIndex]!);
    }
    setPreviewIndex(null);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (activePointerId.current === event.pointerId) {
      activePointerId.current = null;
      // A cancelled gesture never reaches release, so whatever it was aiming
      // at should not stick — back to null in the default gesture, back to
      // whatever was raised before this press in `tapToSelect`, since that
      // one is not this press's to change.
      setPreviewIndex(tapToSelect ? raisedBeforePress.current : null);
    }
  };

  if (cards.length === 0) {
    // Built to the exact height of a row of cards rather than to whatever the
    // text needs. This footer is pinned to the bottom of a fixed-height frame,
    // so an empty state of its own size hands back the difference the moment
    // the first card arrives and shifts every row above it.
    return (
      <div className="px-3 pb-1">
        <div className="flex items-end pt-9">
          <p className="flex h-20 w-full items-center justify-center text-sm text-white/50">
            No cards yet
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={frameRef} className="overflow-x-auto px-3 pb-1">
      <div
        ref={rowRef}
        // `select-none` and the `-webkit-touch-callout` reset stop iOS from
        // treating a press-and-drag here as a text-selection gesture — left
        // alone, it shows its own magnifying loupe over whatever the finger
        // is on, which is what was actually cutting the previewed card off,
        // not any layout of ours.
        className="mx-auto flex w-max touch-none items-end pt-9 select-none [-webkit-touch-callout:none]"
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Scaled the same way the draw's own flight is, so the hand
            finishes parting exactly as the new card arrives regardless of
            pacing — see `currentPacing`'s own doc comment for why a flight
            and whatever times itself off it both have to agree on this. */}
        {cards.map((card, index) => {
          const flightDuration = DRAW_TIMING.flight * currentPacing();
          const legal = isLegal(card);
          const previewed = previewIndex === index;
          const isNew = highlight !== null && sameCard(highlight, card);
          const step = steps[index - 1];

          return (
            <button
              key={cardId(card)}
              type="button"
              aria-label={spokenCardLabel(card)}
              // Read by the draw screen to find where a newly kept card
              // actually lands, so its flight can aim there instead of a
              // generic point — see `DrawPhase`'s `findHandSlot`.
              data-card-id={cardId(card)}
              className={[
                "shrink-0 origin-bottom",
                previewed
                  ? tapToSelect
                    // A raise that has to be noticed without a finger still on
                    // it to draw the eye there — the extra height stays inside
                    // the row's `pt-9` headroom (24px of lift plus 8px from the
                    // scale, against 36px available), so the glow and the
                    // thicker ring are what carry the rest of "very".
                    ? "z-10 -translate-y-6 scale-110 shadow-lg shadow-amber-400/50 ring-4 ring-inset ring-amber-300"
                    : "z-10 -translate-y-5 scale-110 ring-2 ring-inset ring-amber-300"
                  // Only worth raising when it actually separates legal cards
                  // from illegal ones — an unrestricted lead has no illegal
                  // cards to separate them from, so every card would rise the
                  // same 12px together, which reads as the whole hand
                  // twitching rather than as any one card being called out.
                  : restrictedByRule && legal
                    ? "-translate-y-3"
                    : "",
                playable !== null && !legal ? "opacity-40" : "",
              ].join(" ")}
              // Two speeds sharing one element: a press has to feel instant, so
              // the raise/glow/fade stay quick regardless of what else is going
              // on. `margin-left` is what makes room for a card landing
              // mid-hand during the draw, so it gets the flight's own duration
              // instead — the hand finishes parting right as the new card
              // arrives, rather than snapping open well before or after it.
              //
              // That transition is draw-only, on purpose: `playable` is null
              // throughout the draw and never null during play, so `steps`
              // changing at the start of a trick — a new suit led, a
              // different set of cards now legal — snaps instantly rather
              // than gliding. `nearestLegalIndex` reads `steps` the instant it
              // changes, and a tap during a glide was being hit-tested against
              // where a card was headed rather than where it still visually
              // sat — a raised card's wider hit band, claimed before the card
              // had actually moved into it.
              style={{
                transition:
                  playable === null
                    ? `transform 150ms ease-out, box-shadow 150ms ease-out, opacity 150ms ease-out, margin-left ${flightDuration}ms ease-out`
                    : "transform 150ms ease-out, box-shadow 150ms ease-out, opacity 150ms ease-out",
                ...(step === undefined ? {} : { marginLeft: step - CARD_WIDTH }),
              }}
              disabled={!legal || onPlay === null}
              onClick={(event) => {
                // A press is handled entirely by the row's own pointer
                // handlers above; `detail` is 0 only for a click that never
                // went through a pointer sequence at all — keyboard and
                // assistive-tech activation, the one path those can't cover.
                if (event.detail === 0) {
                  onPlay?.(card);
                }
              }}
            >
              <span className="relative block">
                <CardFace card={card} size="hand" />
                {isNew ? (
                  // Marks the card in place, inside its own bounds and under
                  // its neighbor like every other card. The wash is what
                  // carries it: all that stays visible of an overlapped card is
                  // the narrow strip down its left, so the mark has to read
                  // there rather than around the whole outline.
                  <motion.span
                    // Keyed on the card, so the flash replays for each arrival.
                    key={cardId(card)}
                    className="pointer-events-none absolute inset-0 rounded-lg bg-amber-300/35 inset-ring-2 inset-ring-amber-400"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0.35, 1] }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
