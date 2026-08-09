import { motion } from "framer-motion";
import type { Card } from "@hb/engine";
import { DRAW_TIMING } from "../game/timing.js";
import { CardBack, CardFace } from "./CardFace.js";
import type { CardSize } from "./CardFace.js";

/** A point within the draw area, in pixels from its top-left corner. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Flight {
  /** Face up when the card is yours to see; null travels face down. */
  readonly card: Card | null;
  /** Milliseconds before it sets off, so card 2 follows card 1 rather than racing it. */
  readonly delay: number;
  readonly from: Point;
  /** Milliseconds to pause at `via`, to be read or to be identified. */
  readonly hold: number;
  readonly key: string;
  readonly size: CardSize;
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
 * One card leaving the pair for wherever the turn sent it.
 *
 * The movement is the message: a turn spends both cards of the pair, and which
 * one ends in a hand rather than the discard is precisely the choice that was
 * made.
 *
 * A card with a `via` stops there on the way. That is card 2 on a keep — the
 * card the rules have you look at and the one you would otherwise never see —
 * pausing where it already lay so that turning over and being thrown away read
 * as one movement. It is not replayable; once it lands it is gone.
 */
export function DrawFlight({ flight }: { readonly flight: Flight }): React.JSX.Element {
  const half = HALF[flight.size] ?? HALF.table!;
  const { delay, from, hold, to, via } = flight;

  const straight = via === null || hold === 0;
  const total = straight ? DRAW_TIMING.flight : DRAW_TIMING.flight + hold;
  const leg = DRAW_TIMING.flight / 2 / total;

  return (
    <motion.div
      className="pointer-events-none absolute top-0 left-0"
      style={{ marginLeft: -half.x, marginTop: -half.y }}
      initial={{ x: from.x, y: from.y, opacity: 0, scale: 0.8 }}
      animate={
        straight
          ? { x: to.x, y: to.y, opacity: [1, 1, 0], scale: 0.75 }
          : {
              x: [from.x, via.x, via.x, to.x],
              y: [from.y, via.y, via.y, to.y],
              opacity: [1, 1, 1, 0],
              scale: [0.8, 1, 1, 0.7],
            }
      }
      transition={{
        delay: delay / 1000,
        duration: total / 1000,
        ease: "easeInOut",
        ...(straight ? {} : { times: [0, leg, 1 - leg, 1] }),
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
