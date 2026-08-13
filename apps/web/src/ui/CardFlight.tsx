import { motion } from "framer-motion";
import type { Card } from "@hb/engine";
import { CardBack, CardFace } from "./CardFace.js";
import type { CardSize } from "./CardFace.js";

/** A point on screen, in pixels from its container's top-left corner. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The center of a rect, relative to a container's — both in viewport pixels. */
function centerOfRect(container: DOMRect, rect: DOMRect): Point {
  return {
    x: rect.left - container.left + rect.width / 2,
    y: rect.top - container.top + rect.height / 2,
  };
}

/** The center of an element, relative to a container — or null without one. */
export function centerIn(container: DOMRect, element: HTMLElement | null): Point | null {
  return element === null ? null : centerOfRect(container, element.getBoundingClientRect());
}

/**
 * The center of a rect captured earlier, relative to a container now.
 *
 * For a flight's `from` when the thing it left no longer has an element to
 * measure — a card played out of a hand is gone from the DOM the instant the
 * state update lands, so its position has to be captured before that, by
 * whoever handled the action, and handed in as a plain rect instead.
 */
export function centerInFromRect(container: DOMRect, rect: DOMRect | null): Point | null {
  return rect === null ? null : centerOfRect(container, rect);
}

export interface Flight {
  /** Face up when the card is yours to see; null travels face down. */
  readonly card: Card | null;
  /** Milliseconds before it sets off, so a second card can follow rather than race the first. */
  readonly delay: number;
  /**
   * Whether it fades away as it lands, rather than arriving solid.
   *
   * Fading only makes sense when the real thing is already sitting at `to`,
   * so dissolving into it reveals what was there the whole time — the draw's
   * kept card and its discarded twin, both landing on top of an already
   * -occupied hand or pile. A card played to a trick has nothing under it
   * until it lands; fading it out on arrival would empty the destination for
   * an instant before whoever renders the real card fills it back in, which
   * is a blink, not a landing.
   */
  readonly fade: boolean;
  readonly from: Point;
  /** Milliseconds to pause at `via`, to be read or to be identified. */
  readonly hold: number;
  readonly key: string;
  readonly size: CardSize;
  /** Milliseconds for one point-to-point leg — `from` to `via`, or `via` to `to`. */
  readonly travel: number;
  readonly to: Point;
  /** A waypoint to stop at on the way. Null flies straight through. */
  readonly via: Point | null;
}

/** Half-dimensions, so a Point addresses a card's center, not its top-left corner. */
const HALF: Record<string, { x: number; y: number }> = {
  mini: { x: 14, y: 20 },
  table: { x: 32, y: 48 },
};

/**
 * One card leaving `from` for `to`, optionally pausing at `via` on the way.
 *
 * A card with a `via` stops there — held long enough to be read or identified
 * — before finishing the trip. Shared by the draw, where a kept card 2 turns
 * face up where it already lies before being thrown away, and by a card
 * played to a trick, which never pauses at all. Not replayable: once a flight
 * lands it is gone.
 */
export function CardFlight({ flight }: { readonly flight: Flight }): React.JSX.Element {
  const half = HALF[flight.size] ?? HALF.table!;
  const { delay, fade, from, hold, to, travel, via } = flight;

  const straight = via === null || hold === 0;
  // `travel` is documented as one leg's own duration, so a via'd flight —
  // from to via, a hold, then via to to — spends it *twice*: once each way,
  // with the hold sitting between them rather than eating into either.
  // Dividing it in half here once left each leg with only half its own
  // travel time inside a `total` that was short a whole leg to begin with,
  // so the second leg — a kept turn's card 2, actually leaving for the
  // discard pile — covered its real distance in a sliver too brief to read
  // as travel at all, fading out well before the eye had caught it moving.
  const total = straight ? travel : travel * 2 + hold;
  const leg = straight ? 0 : travel / total;
  // The scale it settles at as much as the opacity: a fading flight can end a
  // little smaller without anyone noticing, since it is dissolving away
  // regardless — but a solid one is about to *become* the resting card, so it
  // has to end at that card's own scale or the handoff itself is a jump.
  const arriveOpacity = fade ? 0 : 1;
  const arriveScale = fade ? 0.75 : 1;
  // The second leg's own fraction spent actually moving, before it sits still
  // at `to` for what is left of it — see the `fade` field's own doc comment:
  // dissolving is something a card does once it has already arrived, not
  // while it is still covering the distance. Fading across the whole leg,
  // arrival included, was technically in sync after the timing fix above and
  // still read as vanishing rather than travelling, because a card that is
  // half transparent by the time it is half of the way there was never once
  // seen solid *in motion* — only solid and still, then gone.
  const arrives = 1 - leg * 0.25;

  return (
    <motion.div
      className="pointer-events-none absolute top-0 left-0"
      style={{ marginLeft: -half.x, marginTop: -half.y }}
      initial={{ x: from.x, y: from.y, opacity: 0, scale: 0.8 }}
      animate={
        straight
          ? { x: to.x, y: to.y, opacity: [1, 1, arriveOpacity], scale: arriveScale }
          : {
              // Reaches `to` at `arrives`, opacity and scale still untouched
              // — solid all the way there — and only the last stretch after
              // that, sitting still, is what fades: dissolving into the pile
              // once it is *at* the pile, never while still closing on it.
              x: [from.x, via.x, via.x, to.x, to.x],
              y: [from.y, via.y, via.y, to.y, to.y],
              opacity: [1, 1, 1, 1, arriveOpacity],
              scale: [0.8, 1, 1, 1, fade ? 0.7 : 1],
            }
      }
      transition={{
        delay: delay / 1000,
        duration: total / 1000,
        // A single easing curve reshapes progress across the *entire*
        // duration before the keyframe breakpoints below ever see it, so a
        // via'd flight's `times` fractions stopped landing at those
        // fractions of real elapsed time — easeInOut moves fastest through
        // the middle of the timeline, which is exactly where the hold sits,
        // so the fade at `1 - leg` arrived early and well before the travel
        // it was supposed to accompany had gone anywhere. Linear here makes
        // the breakpoints land exactly where they say. The single-segment
        // straight case has no breakpoints to disagree with, so it keeps
        // the smoother curve.
        ease: straight ? "easeInOut" : "linear",
        ...(straight ? {} : { times: [0, leg, 1 - leg, arrives, 1] }),
      }}
    >
      {flight.card === null ? (
        <CardBack size={flight.size} />
      ) : (
        <CardFace card={flight.card} size={flight.size} />
      )}
    </motion.div>
  );
}
