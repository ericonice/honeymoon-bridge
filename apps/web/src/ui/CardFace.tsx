import type { Card } from "@hb/engine";
import { rankLabel, suitIsRed, suitSymbol } from "../game/labels.js";

export type CardSize = "feature" | "hand" | "mini" | "table";

/**
 * Sizes are set here rather than by the caller so cards stay the same size
 * everywhere they appear. `feature` is the single card you are deciding on
 * during the draw, which wants to be unmistakably the subject of the screen.
 */
const SIZES: Record<CardSize, string> = {
  feature: "h-40 w-28 rounded-2xl p-2 text-2xl",
  hand: "h-20 w-14 rounded-lg p-1 text-base",
  mini: "h-10 w-7 rounded p-0.5 text-[0.6rem]",
  table: "h-24 w-16 rounded-xl p-1.5 text-lg",
};

export interface CardFaceProps {
  readonly card: Card;
  readonly size: CardSize;
}

export function CardFace({ card, size }: CardFaceProps): React.JSX.Element {
  const tone = suitIsRed(card.suit) ? "text-ink-red" : "text-ink-black";

  return (
    <div
      className={`${SIZES[size]} ${tone} card-face flex flex-col justify-between shadow-md ring-1 ring-black/20`}
    >
      {/* Flush top-left, because in a fanned hand this narrow strip is the only
          part of the card that is not covered by the next one. */}
      <span className="flex flex-col items-start leading-none font-bold">
        {rankLabel(card.rank)}
        <span className="text-[0.8em]">{suitSymbol(card.suit)}</span>
      </span>
      <span className="self-center text-[1.75em] leading-none">{suitSymbol(card.suit)}</span>
    </div>
  );
}

export interface CardBackProps {
  readonly size: CardSize;
}

/**
 * The back is a surface rather than a picture of anything: scored ice on the
 * hockey theme, the inset border on the baize. Both are drawn at four sizes,
 * from a mini in the scorepad up to the 26-card stock in the draw phase, and a
 * texture is the one thing that survives that without a focal point to fight
 * whatever sits on top of it.
 */
export function CardBack({ size }: CardBackProps): React.JSX.Element {
  return (
    <div
      className={`${SIZES[size]} card-back flex items-center justify-center shadow-md ring-1 ring-black/20`}
    >
      {/* The frame is not decoration. The opponent's hand is a row of backs
          overlapped to a 12px strip, and this line down the left of each one is
          the only thing that makes them countable — a plain dark back merges
          into one shape. */}
      <span className="h-full w-full rounded-md border-2 border-card-back-mark/60" />
    </div>
  );
}

/** A card-shaped hole, for a trick slot nobody has played to yet. */
export function CardSlot({ size }: CardBackProps): React.JSX.Element {
  return <span className={`${SIZES[size]} block border-2 border-dashed border-white/15`} />;
}
