import { motion } from "framer-motion";
import type { DrawLesson } from "../game/walkthrough.js";

/**
 * One lesson of the draw walkthrough, over the top of the board it describes.
 *
 * Pinned to the **top** of the draw screen deliberately. Everything it talks about —
 * the cards on offer, the piles, your own hand — is in the lower two thirds, and a
 * note that covered the thing it was explaining would be worse than no note. What it
 * does cover is the opponent's furniture, which neither lesson is about.
 *
 * No scrim, and the board is left readable: the point is to be read *against* the
 * live table. What is suspended instead is the decision itself — `DrawPhase` holds
 * the choices back while a lesson is up, so the cards sit there unmarked and
 * unlabelled rather than looking takeable and refusing the tap.
 *
 * `Overlay` was the obvious thing to reuse and is the wrong shape: it centres itself
 * and dims what is behind it, which is right for looking something up mid-trick and
 * exactly wrong for being told what you are looking at.
 */
export function DrawLessonNote({
  lesson,
  onDone,
  remaining,
}: {
  readonly lesson: DrawLesson;
  onDone(): void;
  /** How many lessons are left including this one, so the last one can say so. */
  readonly remaining: number;
}): React.JSX.Element {
  return (
    <motion.div
      // Keyed by the caller on the lesson, so each arrives as its own note rather
      // than the text swapping under a panel that never moved.
      className="absolute inset-x-0 top-0 z-20 flex justify-center px-4"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-table-dark/97 p-4 ring-1 ring-amber-300/40">
        <p className="text-sm font-semibold text-amber-200">{lesson.title}</p>
        <p className="mt-1.5 text-sm leading-snug text-white/80">{lesson.body}</p>
        <button
          type="button"
          className="mt-3 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-stone-900"
          onClick={onDone}
        >
          {remaining > 1 ? "Got it" : "Got it — let me play"}
        </button>
      </div>
    </motion.div>
  );
}
