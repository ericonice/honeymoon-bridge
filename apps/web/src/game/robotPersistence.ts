import type { Card, MatchState, Pair } from "@hb/engine";
import type { BoardOutcome } from "../bot/boardRecall.js";
import type { Difficulty } from "../bot/difficulty.js";

/**
 * A robot rubber, saved so it survives a reload rather than only a re-render.
 *
 * The match alone is not enough to resume identically. The bot's release and
 * difficulty are read *once* when a rubber starts and pinned for its whole
 * length — an opponent that changed strength mid-rubber would be two
 * different opponents in one match — so a resume has to reconstruct the same
 * pinned bot rather than read whatever is currently preferred, which may have
 * changed in the meantime. Board memory travels alongside for the same
 * reason it lives beside `DealState` rather than inside it: it is the host's
 * own note of what the bot saw, not part of the deal.
 */
export interface RobotMatchSnapshot {
  /** The bot's board memory, as `Map` entries — see `boardOffers` in `useLocalSession`. */
  readonly boardOffers: readonly (readonly [
    number,
    { readonly pairs: readonly Pair<Card>[]; readonly result: BoardOutcome },
  ])[];
  /** The seed the deal on the table was dealt from — see `dealSeed`'s own doc. */
  readonly dealSeed: number;
  readonly match: MatchState;
  /**
   * Whether this match's finish has already been reported to the server.
   *
   * Without this, a reload landing exactly between a rubber finishing and its
   * report going out would report it a second time — `reported` inside
   * `useLocalSession` resets to `false` on every fresh mount, which a restore
   * must not do.
   */
  readonly reported: boolean;
  readonly rung: Difficulty;
  /** The pinned release's version number — see `releaseFor`. */
  readonly version: number;
}

const STORAGE_KEY = "hb.robotMatch";

/** Cheap enough to call from `App.tsx`'s own initial screen, to decide where a reload lands. */
export function hasSavedRobotMatch(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // Safari in private mode throws rather than returning null.
    return false;
  }
}

export function saveRobotMatch(snapshot: RobotMatchSnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Nothing to do; the worst case is a reload starting over, same as today.
  }
}

/**
 * Whatever was saved, unvalidated — the caller is the one place that knows how
 * to check a resumed match actually plays, and the one place that can fall
 * back to a fresh one if it does not. A stale snapshot from a build whose
 * `MatchState` shape has since moved on must never crash the app it was
 * meant to save time in.
 */
export function loadRobotMatch(): RobotMatchSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : (JSON.parse(raw) as RobotMatchSnapshot);
  } catch {
    return null;
  }
}

/**
 * Called on a deliberate leave and once a finished match is reported — the
 * two moments after which there is nothing left to resume. Leaving already
 * tells a player plainly that an unfinished match is not kept anywhere; this
 * is what keeps that true rather than merely worded that way.
 */
export function clearRobotMatch(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
