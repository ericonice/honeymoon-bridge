import type { Unlock } from "@hb/engine";
import { motion, useReducedMotion } from "framer-motion";
import { ACHIEVEMENTS, tierLabel } from "../game/labels.js";
import { FamilyIcon } from "./icons.js";
import { TIER_FILL, TIER_INK } from "./tiers.js";

export interface AchievementToastProps {
  readonly unlocked: readonly Unlock[];
  onDismiss(): void;
}

/**
 * One unlock, as an award rather than as a row.
 *
 * The tier is the thing that was actually earned — bronze, silver and gold are
 * the whole ranking — so it is what the badge is made of and the first word
 * read. It used to be an 11px caption in the same amber as every other tier,
 * under an icon that is identical for a Grand Slam and for Hands Played; the
 * medal was the one fact the announcement did not carry.
 *
 * Order top to bottom is the order the news matters in: the metal, then what
 * this tier of it is called, then which family it belongs to. The family name is
 * last and quietest because it is the part you can look up later.
 */
function Award({ unlock }: { readonly unlock: Unlock }): React.JSX.Element {
  const info = ACHIEVEMENTS[unlock.achievement];
  const still = useReducedMotion() ?? false;

  return (
    <div className="flex flex-col items-center gap-2 px-5 py-4 text-center">
      <motion.span
        className={`flex h-16 w-16 items-center justify-center rounded-full ${TIER_FILL[unlock.tier]}`}
        // A single spring on the badge and nothing else. This is the one moment
        // in the app that is a reward, and it earns an entrance — but a reward
        // that keeps moving is a reward you are waiting out.
        initial={still ? false : { scale: 0.72, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
      >
        <FamilyIcon achievement={unlock.achievement} className={`h-8 w-8 ${TIER_INK[unlock.tier]}`} />
      </motion.span>

      <span
        className={`text-[0.7rem] font-semibold tracking-[0.18em] uppercase ${TIER_INK[unlock.tier]}`}
      >
        {tierLabel(unlock.tier)}
      </span>

      <span className="text-lg leading-snug font-semibold">{info.tiers[unlock.tier]}</span>
      <span className="text-xs text-white/45">{info.name}</span>
    </div>
  );
}

/**
 * What just unlocked, named on top of the game rather than saved for later.
 *
 * The robot game has no server in the loop while it is being played, so this is
 * shown from the same local guess `useAchievementTracker` already made — see its
 * own doc comment for the one thing that means: it can name something that, if
 * the report right after it never reaches the server, will not actually have
 * persisted. Accepted rather than solved, because waiting on that round trip
 * would mean no notification at all while offline, which is most of the point of
 * playing against the computer.
 *
 * **Modal, and it stays modal.** A title earned mid-hand is easy to miss out of
 * the corner of an eye, and there is nothing else in the app that would ever
 * mention it again — the Achievements screen is a button on Home with no unread
 * mark on it. Unlocks are also rare: the counter families cross at 50, 250 and
 * 1000, and most of the rest are once-ever. A modal for something that happens
 * every few sessions is a moment, not an interruption.
 *
 * One control, not three. It used to be dismissable by the backdrop, by the
 * award itself and by a button, none of which read as a control — which is what
 * the button was apologising for. The backdrop still works, because tapping away
 * from a thing is how every other overlay here closes, and the button below is
 * the one that looks like one.
 */
export function AchievementToast({
  onDismiss,
  unlocked,
}: AchievementToastProps): React.JSX.Element | null {
  if (unlocked.length === 0) {
    return null;
  }

  return (
    <div
      className="safe-inset absolute inset-0 z-50 flex items-center justify-center bg-black/75 px-5"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-xs overflow-hidden rounded-2xl bg-table-dark shadow-lg ring-1 ring-white/15"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {/* A rubber-winning deal can unlock more than one thing at once, so this
            divides rather than assuming a single award. Hairlines between them
            rather than separate cards: two cards read as two events, and they
            are one — the same deal earned both. */}
        {unlocked.map((unlock, index) => (
          <div
            key={`${unlock.achievement}:${unlock.tier}`}
            className={index === 0 ? "" : "border-t border-white/10"}
          >
            <Award unlock={unlock} />
          </div>
        ))}

        <button
          type="button"
          className="w-full border-t border-white/10 py-3 text-sm font-semibold text-white/70"
          onClick={onDismiss}
        >
          Done
        </button>
      </div>
    </div>
  );
}
