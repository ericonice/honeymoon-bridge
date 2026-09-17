import type { MatchFormat } from "@hb/engine";

/**
 * The formats a report may name, as a list the compiler checks against the union.
 *
 * **A validating reader is a second definition of a union and the compiler does not
 * know the two are meant to agree** — which this project has now paid for twice. The
 * client's `preferredFormat` shipped Mirror broken by reading it back as a rubber,
 * and the same shape here quietly filed every field session as a rubber: stored with
 * a matchpoint percentage where points go, and rated, because the rating walk excludes
 * `'field'` and these rows did not say `field`.
 *
 * The assignment below fails to **compile** the next time `MatchFormat` widens, which
 * is the only guard that lasts. `test/format.test.ts` walks the same list through both
 * readers so a name that is listed but not handled cannot pass either.
 */
const FORMATS = ["duplicate", "field", "game", "mirror", "rubber"] as const;

type Listed = (typeof FORMATS)[number];
export const everyFormatIsListed: MatchFormat extends Listed ? true : never = true;

export function isMatchFormat(value: unknown): value is MatchFormat {
  return typeof value === "string" && (FORMATS as readonly string[]).includes(value);
}

/**
 * What to store for a reported format.
 *
 * Anything unrecognised is a rubber, which is what a client too old to know about
 * formats was playing. A format this build *does* know is kept exactly as sent, on
 * the same terms as an unrecognised difficulty rung: `ratings.ts` can then come out
 * right by itself once it learns what to do with it, rather than being handed
 * something the match was not.
 */
export function storedFormat(value: unknown): MatchFormat {
  return isMatchFormat(value) ? value : "rubber";
}
