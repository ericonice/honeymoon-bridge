import type { Tier } from "@hb/engine";

/**
 * What bronze, silver and gold actually look like.
 *
 * One place, because two screens show them and they must not drift: the toast
 * that announces an unlock and the Achievements screen you go to afterwards to
 * look at it. They used to disagree by both being wrong in the same way — a
 * single amber for all three, so a gold was indistinguishable from a bronze on
 * either. The tokens themselves are per-theme; see `index.css`.
 *
 * Ranked highest first, which is the order anything summarising a family wants:
 * "the best tier held" is a `find` over this rather than a comparison table.
 */
export const TIERS_BY_RANK: readonly Tier[] = ["gold", "silver", "bronze"];

/** The metal itself, for a glyph or a word. */
export const TIER_INK: Record<Tier, string> = {
  bronze: "text-tier-bronze",
  silver: "text-tier-silver",
  gold: "text-tier-gold",
};

/**
 * A held tier's own surface: its metal at low opacity, ringed in a little more
 * of it.
 *
 * A wash rather than the solid metal, because these are chips of text on a dark
 * table and solid gold behind small type is unreadable. The ring is what keeps a
 * bronze chip from reading as a stain — at 12% the fill alone is barely a colour,
 * and the edge is where the metal is actually legible.
 */
export const TIER_FILL: Record<Tier, string> = {
  bronze: "bg-tier-bronze/12 ring-1 ring-tier-bronze/45",
  silver: "bg-tier-silver/12 ring-1 ring-tier-silver/45",
  gold: "bg-tier-gold/12 ring-1 ring-tier-gold/45",
};

/** A tier this account has not reached: present, legible, plainly not earned. */
export const TIER_UNHELD = "bg-white/5 text-white/35";

/** The best tier held in a family, or null if none of them is. */
export function bestHeld(held: (tier: Tier) => boolean): Tier | null {
  return TIERS_BY_RANK.find((tier) => held(tier)) ?? null;
}
