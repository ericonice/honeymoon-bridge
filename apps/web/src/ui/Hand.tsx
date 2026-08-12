import { cardId, sameCard } from "@hb/engine";
import type { Card } from "@hb/engine";
import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { spokenCardLabel } from "../game/labels.js";
import { CardFace } from "./CardFace.js";

/** Matches the `hand` size in `CardFace`. */
const CARD_WIDTH = 56;

/** Never squeeze a card's exposed strip below this, or the index becomes unreadable. */
const MIN_STEP = 18;

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

  // `steps[i]` is the gap before card i + 1, so it is the exposure of card i.
  let steps: number[] = cards.slice(1).map((_, index) => {
    if (!restricted) {
      return CARD_WIDTH;
    }
    return emphasized(cards[index]!) ? LEGAL_STEP : TIGHT_STEP;
  });

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
   */
  readonly playable: readonly Card[] | null;
  readonly onPlay: ((card: Card) => void) | null;
}

export function Hand({ cards, highlight, onPlay, playable }: HandProps): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(320);
  // The card a press currently has raised — set to the nearest legal card on
  // pointer down, retargeted on pointer move, and whatever it holds when the
  // pointer lifts is what plays.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const activePointerId = useRef<number | null>(null);

  // Remeasure on rotation and on the keyboard-driven viewport changes iOS makes.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (frame === null) {
      return;
    }
    const measure = (): void => {
      setAvailable(frame.clientWidth);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  }, []);

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
  const nearestLegalIndex = (x: number): number | null => {
    let best: number | null = null;
    let bestDistance = Infinity;
    cards.forEach((card, index) => {
      if (!isLegal(card)) {
        return;
      }
      const distance = Math.abs(x - (lefts[index]! + CARD_WIDTH / 2));
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
    if (previewIndex !== null) {
      onPlay?.(cards[previewIndex]!);
    }
    setPreviewIndex(null);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (activePointerId.current === event.pointerId) {
      activePointerId.current = null;
      setPreviewIndex(null);
    }
  };

  if (cards.length === 0) {
    // Built to the exact height of a row of cards rather than to whatever the
    // text needs. This footer is pinned to the bottom of a fixed-height frame,
    // so an empty state of its own size hands back the difference the moment
    // the first card arrives and shifts every row above it.
    return (
      <div className="px-3 pb-1">
        <div className="flex items-end pt-4">
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
        className="mx-auto flex w-max touch-none items-end pt-4 select-none [-webkit-touch-callout:none]"
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {cards.map((card, index) => {
          const legal = isLegal(card);
          const previewed = previewIndex === index;
          const isNew = highlight !== null && sameCard(highlight, card);
          const step = steps[index - 1];

          return (
            <button
              key={cardId(card)}
              type="button"
              aria-label={spokenCardLabel(card)}
              className={[
                "shrink-0 origin-bottom transition-all duration-150 ease-out",
                previewed ? "z-10 scale-110 ring-2 ring-inset ring-amber-300" : legal ? "-translate-y-3" : "",
                playable !== null && !legal ? "opacity-40" : "",
              ].join(" ")}
              style={step === undefined ? undefined : { marginLeft: step - CARD_WIDTH }}
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
