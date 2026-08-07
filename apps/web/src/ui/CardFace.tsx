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
  const tone = suitIsRed(card.suit) ? "text-red-600" : "text-stone-900";

  return (
    <div
      className={`${SIZES[size]} ${tone} flex flex-col justify-between bg-white shadow-md ring-1 ring-black/20`}
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

export function CardBack({ size }: CardBackProps): React.JSX.Element {
  return (
    <div
      className={`${SIZES[size]} flex items-center justify-center bg-sky-900 shadow-md ring-1 ring-black/20`}
    >
      <span className="h-full w-full rounded-md border-2 border-sky-600/60" />
    </div>
  );
}

/** A card-shaped hole, for a trick slot nobody has played to yet. */
export function CardSlot({ size }: CardBackProps): React.JSX.Element {
  return <span className={`${SIZES[size]} block border-2 border-dashed border-white/15`} />;
}
