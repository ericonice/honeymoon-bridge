import { boardsForDeals } from "@hb/engine";
import type { DuplicateSchedule, MatchFormat, RubberFormat } from "@hb/engine";
import type { TableRole } from "@hb/protocol";

/** What one seat asked for when it sat down. */
export interface Asked {
  /** How long a duplicate session, in deals. Ignored unless both asked for one. */
  readonly deals: number;
  readonly format: MatchFormat;
  /** What each half of a two-game match runs to. Ignored unless both asked for one. */
  readonly halfFormat: RubberFormat;
  /** How they want a session ordered. Ignored unless both asked for the same. */
  readonly order: DuplicateSchedule;
  /** Having minted the code or been handed one, or neither — see `hostAsk`. */
  readonly role: TableRole | null;
}

/** What the table will actually play. */
export interface Agreed {
  /** Boards in a duplicate session. Zero for every other format. */
  readonly boards: number;
  readonly format: MatchFormat;
  /** What each half runs to. Meaningless for any format that has no halves. */
  readonly halfFormat: RubberFormat;
  /** How the session is ordered. Meaningless for any other format. */
  readonly order: DuplicateSchedule;
}


/**
 * The order a disagreement resolves in: **mirror, then a rubber or a game, then
 * duplicate.**
 *
 * This is the fallback — see `hostAsk` for the rule that runs first at an
 * invite, where which format wins is not a disagreement to split but a question
 * with one right answer. It is what a queue match still resolves by, since
 * neither stranger there invited the other.
 *
 * A total ordering rather than a set of rules about which formats need both seats,
 * which is what this used to be. That version made duplicate and mirror take both
 * and fall back to a rubber — sound at an invite, where two people who know each
 * other can simply agree, and useless in a queue, where it meant somebody asking
 * for a session waited for a stranger who wanted the same thing or was quietly
 * handed a rubber with nothing saying why. **A rule that leaves somebody waiting is
 * worse here than one that hands them a neighbouring game**, so this one always
 * produces an answer and nobody is unpaired for a preference.
 *
 * Duplicate is last because it is the format furthest from the game everyone else
 * came for: a board is a scoring unit, the deals repeat, and being dropped into one
 * unasked is being dropped into a different evening. It therefore still takes both
 * seats in practice, since nothing outranks a seat that did not ask for it.
 *
 * Mirror is first because it is the *least* imposing thing that is not a rubber —
 * rubber scoring, a line, a part-score, a race to a hundred, over deals that come
 * back once. Somebody who wanted a rubber and gets a mirror is playing the game they
 * asked for, twice, on cards they have seen.
 *
 * The cost, stated because it is the one asymmetry the old rule existed to avoid:
 * somebody who asked for a **single game** and meets a mirror gets roughly twice
 * what they asked for. Two single-game halves is about eight deals, which is a
 * rubber's own length, so the wrong end of this is one player in one pairing rather
 * than a category of them.
 */
const PRECEDENCE: readonly MatchFormat[] = ["mirror", "rubber", "game", "duplicate"];

/** A rubber and a single game are one format at two lengths, and resolve as one. */
function isRubberish(format: MatchFormat): boolean {
  return format === "game" || format === "rubber";
}

/**
 * Whether two queue waiters could sit at the same table.
 *
 * `null` is nobody's answer to "what do you want", it is "anything" — so it
 * agrees with whatever the other one asked for, including another `null`. Two
 * specific, different formats do not pair, which is what makes asking for one
 * meaningful: a waiter who names a format waits for it rather than being
 * handed whatever a stranger's queue position happened to offer. See
 * `Lobby#pair`, which is the only caller.
 *
 * Compared through `isRubberish` rather than by exact equality, on the same
 * reasoning `formatFor` groups them under one precedence entry: a rubber and a
 * single game are one format at two lengths, and which length wins is a
 * question `formatFor` still answers afterward. A waiter who asked for one
 * should pair with a waiter who asked for the other rather than waiting for
 * an exact match on a distinction that is settled later anyway.
 */
export function compatibleFormats(a: MatchFormat | null, b: MatchFormat | null): boolean {
  if (a === null || b === null) {
    return true;
  }
  return (isRubberish(a) && isRubberish(b)) || a === b;
}

function ranks(format: MatchFormat): number {
  const at = PRECEDENCE.indexOf(format);
  // An unrecognised format from a newer client sorts last, which is the same
  // conservatism the rating anchors take: never impose something nobody named.
  return at === -1 ? PRECEDENCE.length : at;
}

/**
 * The host's ask, when there is one to defer to.
 *
 * A code carries no format of its own — "creating a table is just minting a
 * code" — so the only thing that can stand in for "what this invite is" is
 * whoever created it. The whole sitting, not just which game, is the host's
 * to decide rather than a preference to be split against whatever a guest's
 * device happens to have stored from a different session entirely: typing in
 * somebody's code is joining a game they have already chosen, not proposing
 * one of your own. Only when exactly one seat is marked `"host"` does this
 * apply: two hosts, two guests, and the ordinary case of neither — a queue
 * match, or a client too old to say — all fall back to `PRECEDENCE` below,
 * which is the rule this cannot improve on because nobody there created
 * anything for the other to join.
 */
function hostAsk(first: Asked, second: Asked): Asked | null {
  if (first.role === "host" && second.role !== "host") {
    return first;
  }
  if (second.role === "host" && first.role !== "host") {
    return second;
  }
  return null;
}

/**
 * What the table will actually play, from what the two players each asked for.
 *
 * **At an invite, the host's whole ask wins outright — see `hostAsk`.** Format
 * and length are one decision there, not two: the host already committed to a
 * particular evening before ever sending the code, and a guest's own stored
 * preference — quite possibly left over from an unrelated session — has no
 * more claim on what gets played than a stranger's would.
 *
 * **Without a host to defer to, the two questions split.** Which *game* comes
 * from `PRECEDENCE`, so a disagreement always resolves and nobody waits. How
 * *long* is separate and always takes the **shorter** of what the two asked —
 * the asymmetry this has kept from the start, since somebody held in a rubber
 * they did not agree to owes the better part of an hour, where somebody who
 * wanted a rubber and gets a game can simply play another.
 *
 * The length is read off both seats whichever format wins, because both send every
 * preference they hold rather than only the one matching their chosen format. So a
 * seat that asked for a rubber still has an opinion about how long a mirror's halves
 * run, and it counts.
 *
 * Not in the engine: how long a match lasts is a rule and lives there, but
 * reconciling two people's preferences is about seating them, and the game against
 * the computer has only one preference to consult.
 */
export function formatFor(first: Asked, second: Asked): Agreed {
  const decided = hostAsk(first, second);
  if (decided !== null) {
    return {
      boards: decided.format === "duplicate" ? boardsForDeals(decided.deals) : 0,
      format: decided.format,
      halfFormat: decided.halfFormat,
      order: decided.order,
    };
  }

  const format = ranks(first.format) <= ranks(second.format) ? first.format : second.format;
  // Lowest game count wins, asked of both seats regardless of which format won.
  const halfFormat: RubberFormat =
    first.halfFormat === "game" || second.halfFormat === "game" ? "game" : "rubber";
  const shorterRubber: MatchFormat =
    first.format === "game" || second.format === "game" ? "game" : "rubber";

  if (isRubberish(format)) {
    return { boards: 0, format: shorterRubber, halfFormat, order: "halves" };
  }

  if (format === "duplicate") {
    return {
      // Compared in deals because that is what the player chose; `boardsForDeals`
      // is the one place the two units meet.
      boards: boardsForDeals(Math.min(first.deals, second.deals)),
      format: "duplicate",
      halfFormat,
      // The order takes agreement, which is the one place the old both-seats
      // reasoning still holds: back to back, halves and shuffled are three
      // different games rather than a longer and a shorter one, so there is no
      // "shorter wins" to appeal to. A disagreement falls back to `halves`, which
      // is what a duplicate evening is and is the default nobody has to have
      // asked for.
      order: first.order === second.order ? first.order : "halves",
    };
  }

  return { boards: 0, format, halfFormat, order: "halves" };
}
