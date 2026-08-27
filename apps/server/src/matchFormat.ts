import { boardsForDeals } from "@hb/engine";
import type { DuplicateSchedule, MatchFormat } from "@hb/engine";

/** What one seat asked for when it sat down. */
export interface Asked {
  /** How long a duplicate session, in deals. Ignored unless both asked for one. */
  readonly deals: number;
  readonly format: MatchFormat;
  /** How they want a session ordered. Ignored unless both asked for the same. */
  readonly order: DuplicateSchedule;
}

/** What the table will actually play. */
export interface Agreed {
  /** Boards in a duplicate session. Zero for every other format. */
  readonly boards: number;
  readonly format: MatchFormat;
  /** How the session is ordered. Meaningless for any other format. */
  readonly order: DuplicateSchedule;
}

/**
 * What the sitting runs to, from what the two players each asked for.
 *
 * **Duplicate needs both seats to have asked for it**, and every other
 * disagreement resolves to the shorter of what was asked. Those are two rules
 * rather than one because the two kinds of disagreement are not the same shape.
 *
 * A rubber and a single game differ only in *length*, so there is a shorter one and
 * the shorter wins — deliberately not symmetric, since somebody who wanted one game
 * and is held in a rubber owes the better part of an hour they never agreed to,
 * while somebody who wanted a rubber and gets a game can simply play another. The
 * two mistakes are not the same size.
 *
 * Duplicate is not shorter or longer, it is a **different game**: the deck repeats,
 * the score is one signed number a deal, and half the boards are ones you have seen
 * before. So "shorter wins" has nothing to say about it — and the same asymmetry
 * argument points the other way, because being put into a format you have never
 * played and did not ask for is a worse mistake than getting the rubber you know.
 * So it takes both.
 *
 * A seat that asked for duplicate and did not get it falls back to a **rubber**,
 * which is the default and the game this was built to play. It does not get to
 * impose a single game on somebody who asked for a rubber, having asked for neither.
 *
 * Not in the engine: how long a match lasts is a rule and lives there, but
 * reconciling two people's preferences is about seating them, and the game against
 * the computer has only one preference to consult.
 */
export function formatFor(first: Asked, second: Asked): Agreed {
  if (first.format === "duplicate" && second.format === "duplicate") {
    // The shorter session, for the reason a single game beats a rubber. Compared in
    // deals because that is what the player chose; `boardsForDeals` is the one place
    // the two units meet.
    //
    // The order takes agreement, on the same reasoning duplicate itself does: back to
    // back and shuffled are different games rather than a longer and a shorter one, so
    // there is no "shorter wins" to appeal to — and being handed one you did not ask
    // for is the mistake worth avoiding. A disagreement falls back to `halves`, which
    // is what a duplicate evening is and is the default nobody has to have asked for.
    return {
      boards: boardsForDeals(Math.min(first.deals, second.deals)),
      format: "duplicate",
      order: first.order === second.order ? first.order : "halves",
    };
  }

  const asked = [first, second].map((seat) =>
    seat.format === "duplicate" ? "rubber" : seat.format,
  );
  return { boards: 0, format: asked.includes("game") ? "game" : "rubber", order: "halves" };
}
