import { cardId } from "@hb/engine";
import type { Card } from "@hb/engine";
import { CardFace } from "./CardFace.js";

export interface OpponentPeekProps {
  readonly cards: readonly Card[];
}

/**
 * The opponent's hand, face up. Development builds only.
 *
 * Marked in a colour used nowhere else in the game, and labelled, because the
 * one thing worse than a debug view is not noticing you are looking at one.
 */
export function OpponentPeek({ cards }: OpponentPeekProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-fuchsia-400/40 bg-fuchsia-950/40 px-3 py-1.5">
      <span className="shrink-0 text-[0.65rem] tracking-wide text-fuchsia-300/80 uppercase">
        Opponent
      </span>
      {/* Thirteen minis overlapped come to about 200px, so they always fit and
          the row never needs to scroll. */}
      <div className="flex">
        {cards.map((card, index) => (
          <div key={cardId(card)} className={index > 0 ? "-ml-3.5" : ""}>
            <CardFace card={card} size="mini" />
          </div>
        ))}
      </div>
    </div>
  );
}
