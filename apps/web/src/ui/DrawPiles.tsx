import { useTheme } from "../game/theme.js";
import { CardBack, CardSlot } from "./CardFace.js";

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

function Stack({
  count,
  dimmed,
  label,
  max,
}: {
  readonly count: number;
  readonly dimmed: boolean;
  readonly label: string;
  readonly max: number;
}): React.JSX.Element {
  const layers = layersFor(count, max);
  const theme = useTheme();

  return (
    <div className="flex flex-col items-center gap-2">
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
      </div>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  );
}

/**
 * The stock, as a stack that visibly wears down over the 26 turns.
 *
 * The draw phase is structurally about the deck emptying two cards at a time,
 * and a number alone in the top bar does not convey that. The thickness carries
 * the same information as the count, more bluntly.
 */
export function DrawDeck({ remaining }: { readonly remaining: number }): React.JSX.Element {
  return <Stack count={remaining} dimmed={false} label="in the deck" max={DECK_SIZE} />;
}

/**
 * Where both players' thrown-away cards go. Deliberately inert: it is a place
 * for cards to land, never something to open. Every card in it is face down and
 * permanently gone, including your own.
 */
export function DiscardPile({ count }: { readonly count: number }): React.JSX.Element {
  return <Stack count={count} dimmed label="discarded" max={TOTAL_DISCARDS} />;
}
