import type { Card } from "@hb/engine";
import { useTheme } from "../game/theme.js";
import { CardBack, CardFace, CardSlot } from "./CardFace.js";

const MAX_LAYERS = 4;

const DECK_SIZE = 52;

/** One card per turn is thrown away, across 26 turns. */
const TOTAL_DISCARDS = 26;

/**
 * Layers to draw for a pile of `count` cards, measured against how big that
 * pile ever gets rather than against a fixed number of cards. The stock runs
 * 52 down to 0 and the discard runs 0 up to 26, so a shared scale would leave
 * the discard permanently half-height and make one pile's thickness mean
 * something different from the other's.
 */
function layersFor(count: number, max: number): number {
  return Math.min(MAX_LAYERS, Math.ceil((count / max) * MAX_LAYERS));
}

/**
 * A pile as a stack of cards one card in size, and nothing else.
 *
 * Split out from the labelled piles below so that both of them, and the takeable
 * form of the discard, draw the same stack rather than each keeping a copy of the
 * layering and the count.
 */
function PileStack({
  count,
  dimmed,
  face,
  max,
}: {
  readonly count: number;
  readonly dimmed: boolean;
  /**
   * A card to lay face up as the frontmost layer, which takes the count's place
   * rather than sharing the middle of the card with it. Only the open discard has
   * one.
   */
  readonly face: Card | null;
  readonly max: number;
}): React.JSX.Element {
  const layers = layersFor(count, max);
  const theme = useTheme();

  return (
    <div className={`relative h-24 w-16 ${dimmed ? "opacity-55" : ""}`}>
      {layers === 0 ? (
        <CardSlot size="table" />
      ) : (
        Array.from({ length: layers }, (_, index) => {
          // Back to front, so the last one sits square and the count printed
          // on top of it lines up with a card rather than the stack's edge.
          const depth = layers - 1 - index;
          return (
            <div
              key={depth}
              className="absolute inset-0"
              style={{ transform: `translate(${depth * 2}px, ${depth * -2}px)` }}
            >
              <CardBack size="table" />
            </div>
          );
        })
      )}
      {face === null ? (
        <span className="absolute inset-0 flex items-center justify-center">
          {theme === "hockey" ? (
            // The count on a puck. The number is the information and the spot
            // beneath it is decoration, so the number gets its own ground
            // instead of competing with the ring for the middle of the card.
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-950/85 text-lg font-bold tabular-nums text-white ring-1 ring-white/15">
              {count}
            </span>
          ) : (
            <span className="text-xl font-bold tabular-nums text-white">{count}</span>
          )}
        </span>
      ) : (
        <div className="absolute inset-0">
          <CardFace card={face} size="table" />
        </div>
      )}
    </div>
  );
}

/**
 * A pile that is only ever scenery: a stack, its count, and a word for what it is.
 *
 * Kept at full card size with the count printed across it. A compact strip was tried
 * — a small stack with the number beside it — to buy back about 120px of a phone's
 * height for the third choice below, on the reasoning that the deck's count is
 * derivable from the turn track and the opponent's hand row anyway. It reads worse:
 * the count on the card is the thing you actually look at, and at a third the size
 * there is nowhere to print it. §1.3's piles stand.
 */
function LabelledPile({
  count,
  dimmed,
  label,
  max,
  stackRef,
}: {
  readonly count: number;
  readonly dimmed: boolean;
  readonly label: string;
  readonly max: number;
  /** Where a flight leaves from or lands, so it aims at the card and not the label. */
  readonly stackRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={stackRef}>
        <PileStack count={count} dimmed={dimmed} face={null} max={max} />
      </div>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  );
}

/**
 * The stock, as a stack that visibly wears down over the 26 turns.
 *
 * The draw phase is structurally about the deck emptying two cards at a time, and a
 * number alone in the top bar does not convey that. The thickness carries the same
 * information as the count, more bluntly.
 */
export function DrawDeck({
  remaining,
  stackRef,
}: {
  readonly remaining: number;
  readonly stackRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  return (
    <LabelledPile
      count={remaining}
      dimmed={false}
      label="in the deck"
      max={DECK_SIZE}
      stackRef={stackRef}
    />
  );
}

/**
 * Where both players' thrown-away cards go — and, under `openDiscard`, a third thing
 * this turn can be spent on.
 *
 * It stays here beside the stock either way. Putting it into the choice row with the
 * turn's own two cards was tried, on §1.3's reasoning that the choice should be the
 * rule as a picture: "a turn offers you these cards and you take one" is three cards
 * abreast. Three of them across a phone is cramped, and the pile is not the same kind
 * of object as the two cards — it is a standing pile with a count on it that happens
 * to have a takeable card on top, and lining it up as a third card said otherwise.
 *
 * Inert under the game's own rules: a place for cards to land, never something to
 * open, every card in it face down and permanently gone including your own — which
 * is why it is dimmed. Under `openDiscard` the top lies face up on your turn and can
 * be taken, so it stops being dimmed and takes the amber edge like any other choice.
 */
export function DiscardPile({
  count,
  edge,
  label,
  onTake,
  stackRef,
  top,
}: {
  readonly count: number;
  /** Classes marking the pile takeable, or undefined — see `TAKEABLE_EDGE` in `DrawPhase`. */
  readonly edge: string | undefined;
  readonly label: string;
  readonly onTake: (() => void) | null;
  /** Where a flight leaves from or lands, so it aims at the card and not the label. */
  readonly stackRef: React.RefObject<HTMLDivElement | null>;
  /** The face-up top, under the open discard and while the turn is this seat's. */
  readonly top: Card | null;
}): React.JSX.Element {
  const takeable = onTake !== null;
  const body = (
    <div className="flex flex-col items-center gap-2">
      <div ref={stackRef} className={edge}>
        <PileStack
          count={count}
          dimmed={top === null && !takeable}
          face={top}
          max={TOTAL_DISCARDS}
        />
      </div>
      <p className={`text-xs ${takeable ? "font-medium text-amber-200" : "text-white/50"}`}>
        {label}
      </p>
    </div>
  );

  if (!takeable) {
    return body;
  }
  // Padded past the card like the choice pair's own halves, and for the same reason:
  // this is a way to spend a turn that cannot be taken back. The negative margin
  // cancels the padding for layout, so growing a tap target does not shunt the pile
  // out of line with the stock beside it.
  return (
    <button
      type="button"
      className="-m-3 rounded-2xl p-3 transition-transform active:scale-95"
      onClick={onTake}
    >
      {body}
    </button>
  );
}
