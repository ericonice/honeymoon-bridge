import type { MatchFormat } from "@hb/engine";

/**
 * How long the sitting runs, from what the two players each asked for.
 *
 * The shorter wins. Somebody who wants one game and gets a rubber is committed
 * to the better part of an hour they did not agree to, while somebody who wanted
 * a rubber and gets a game can simply play another — the two mistakes are not
 * the same size, so the rule is not symmetric either.
 *
 * Not in the engine: how long a match lasts is a rule and lives there, but
 * reconciling two people's preferences is about seating them, and the game
 * against the computer has only one preference to consult.
 */
export function formatFor(first: MatchFormat, second: MatchFormat): MatchFormat {
  return first === "game" || second === "game" ? "game" : "rubber";
}
