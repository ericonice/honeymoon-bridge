import { cardId, sameCard } from "@hb/engine";
import type { Card } from "@hb/engine";
import { motion } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import { spokenCardLabel } from "../game/labels.js";
import { CardFace } from "./CardFace.js";

/** Matches the `hand` size in `CardFace`. */
const CARD_WIDTH = 56;

/** Never squeeze a card's exposed strip below this, or the index becomes unreadable. */
const MIN_STEP = 18;

/**
 * What a playable card aims for: iOS's minimum comfortable tap target. Asking
 * for the full card width instead would only be scaled back down, and would
 * take the width out of the tight cards it is supposed to be borrowing from.
 */
const LEGAL_STEP = 44;

/** What an unplayable card gets, since it only has to be identifiable, not tappable. */
const TIGHT_STEP = 20;

/** The `px-3` on the scroll frame, which `clientWidth` includes. */
const FRAME_PADDING = 24;

/**
 * How far each card sits from the one before it — which is exactly how much of
 * the previous card stays visible, and therefore how big its tap target is.
 *
 * Two things drive it. Cards only overlap as much as they have to, so a hand
 * spreads out as it is played away rather than staying bunched at its
 * thirteen-card spacing. And during the play phase the space goes where it is
 * needed: a card the follow-suit rule forbids is not tappable, so it only needs
 * to be recognisable, and it gives up its width to the cards that are.
 */
function stepsFor(
  cards: readonly Card[],
  playable: readonly Card[] | null,
  available: number,
): number[] {
  if (cards.length <= 1) {
    return [];
  }

  const legal = (card: Card): boolean =>
    playable !== null && playable.some((allowed) => sameCard(allowed, card));
  const restricted = playable !== null && cards.some((card) => !legal(card));

  // `steps[i]` is the gap before card i + 1, so it is the exposure of card i.
  let steps: number[] = cards.slice(1).map((_, index) => {
    if (!restricted) {
      return CARD_WIDTH;
    }
    return legal(cards[index]!) ? LEGAL_STEP : TIGHT_STEP;
  });

  const width = (list: number[]): number => CARD_WIDTH + list.reduce((sum, s) => sum + s, 0);

  if (width(steps) > available) {
    // Shrink what is left proportionally rather than uniformly, so the tight
    // cards stay tight and the playable ones keep the advantage.
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
   * phase. Legal cards are raised and tappable; the rest are dimmed and inert.
   * Card plays are final on release, so the raise and the extra width are the
   * only guards against a misplaced thumb — there is no confirmation step.
   */
  readonly playable: readonly Card[] | null;
  readonly onPlay: ((card: Card) => void) | null;
}

export function Hand({ cards, highlight, onPlay, playable }: HandProps): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(320);

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

  const steps = stepsFor(cards, playable, available - FRAME_PADDING);

  if (cards.length === 0) {
    return <p className="py-6 text-center text-sm text-white/50">No cards yet</p>;
  }

  return (
    <div ref={frameRef} className="overflow-x-auto px-3 pb-1">
      <div className="mx-auto flex w-max items-end pt-4">
        {cards.map((card, index) => {
          const legal = playable !== null && playable.some((allowed) => sameCard(allowed, card));
          const isNew = highlight !== null && sameCard(highlight, card);
          const step = steps[index - 1];

          return (
            <button
              key={cardId(card)}
              type="button"
              aria-label={spokenCardLabel(card)}
              className={[
                "shrink-0",
                legal ? "-translate-y-3" : "",
                playable !== null && !legal ? "opacity-40" : "",
              ].join(" ")}
              style={step === undefined ? undefined : { marginLeft: step - CARD_WIDTH }}
              disabled={!legal || onPlay === null}
              onClick={() => {
                onPlay?.(card);
              }}
            >
              <span className="relative block">
                <CardFace card={card} size="hand" />
                {isNew ? (
                  // Marks the card in place, inside its own bounds and under
                  // its neighbour like every other card. The wash is what
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
