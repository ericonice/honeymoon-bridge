import { motion } from "framer-motion";

/** Room left around the highlighted element, so the cutout does not crop it. */
const PAD = 8;

/** How far the caption sits from the cutout. */
const GAP = 12;

export interface SpotlightProps {
  readonly body: string;
  /** Which step this is, and how many there are, so somebody can see the end coming. */
  readonly index: number;
  onNext(): void;
  onSkip(): void;
  /** What to highlight, in viewport coordinates. Null highlights nothing and centers. */
  readonly rect: DOMRect | null;
  readonly steps: number;
  readonly title: string;
}

/**
 * One step of a tour: everything dimmed but one part of the screen, and a note about
 * it.
 *
 * **The cutout is one element, not four bands around a hole.** A box the size of the
 * highlighted thing with a `box-shadow` spread far past the viewport darkens
 * everything outside itself and nothing inside — so the dimming is a single element
 * that cannot get out of step with itself, and the hole is exactly the rect it was
 * given. Bands would need four boxes agreeing on the same rect.
 *
 * `position: fixed` throughout, because the rects come from `getBoundingClientRect`
 * and are already in viewport coordinates. Nothing here has to know where in the
 * layout the thing it is pointing at lives, which is what lets the caller hand it a
 * ref from one component and a `document` query from another.
 *
 * The caption goes **below** the cutout when the cutout is in the top half and above
 * it when it is in the bottom, so it never lands on the thing it is describing — the
 * one way a tour step can be actively worse than no tour step.
 */
export function Spotlight({
  body,
  index,
  onNext,
  onSkip,
  rect,
  steps,
  title,
}: SpotlightProps): React.JSX.Element {
  const last = index === steps - 1;
  const below = rect !== null && rect.top + rect.height / 2 < window.innerHeight / 2;

  return (
    <div className="fixed inset-0 z-40">
      {rect === null ? (
        <div className="absolute inset-0 bg-black/75" />
      ) : (
        <motion.div
          className="absolute rounded-xl ring-2 ring-amber-300/80"
          // The spread has to beat any viewport this runs on; the shadow is clipped to
          // the screen anyway, so being generous costs nothing.
          style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.75)" }}
          initial={false}
          animate={{
            height: rect.height + PAD * 2,
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
          }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        />
      )}

      <div
        className="absolute inset-x-0 flex justify-center px-4"
        style={
          rect === null
            ? { top: "50%", transform: "translateY(-50%)" }
            : below
              ? { top: rect.bottom + PAD + GAP }
              : { bottom: window.innerHeight - rect.top + PAD + GAP }
        }
      >
        <div className="w-full max-w-sm rounded-2xl bg-table-dark p-4 ring-1 ring-white/15">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-amber-200">{title}</p>
            <p className="shrink-0 text-xs tabular-nums text-white/40">{`${index + 1} of ${steps}`}</p>
          </div>
          <p className="mt-1.5 text-sm leading-snug text-white/80">{body}</p>
          <div className="mt-3 flex gap-2">
            {/* A way out on every step. A tour somebody cannot leave is a tour they
                resent, and this one is offered again from the rules screen. */}
            {last ? null : (
              <button
                type="button"
                className="rounded-xl border border-white/20 px-3 py-2 text-sm text-white/70"
                onClick={onSkip}
              >
                Skip
              </button>
            )}
            <button
              type="button"
              className="flex-1 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-stone-900"
              onClick={onNext}
            >
              {last ? "Got it — let me play" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
