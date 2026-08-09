import type { MatchFormat } from "@hb/engine";
import { readStored, writeStored } from "./storage.js";

const FORMAT_KEY = "hb.format";
const PSYCHS_KEY = "hb.psychs";
const BOLDNESS_KEY = "hb.boldness";
const STRENGTH_KEY = "hb.strength";
const PACE_KEY = "hb.pace";
const PEEK_KEY = "hb.peek";
const NICKNAME_KEY = "hb.nickname";
const TOKEN_KEY = "hb.token";

/**
 * The opaque value that reclaims a seat after a dropped socket.
 *
 * A seat is *held* by this and permitted by an account (§3.7): signing in is
 * what lets somebody sit down opposite a person, and this is what gets them
 * back into the same chair afterwards. Keeping the two apart is what lets a
 * reconnection work when a session has expired underneath a rubber.
 *
 * An account *claims* this token rather than replacing it — see
 * `redeemSignInToken`. The cost that remains is that a rubber in progress is
 * still bound to the device that started it, because nothing yet moves one.
 */
export function playerToken(): string {
  const existing = readStored(TOKEN_KEY);
  if (existing !== null && existing !== "") {
    return existing;
  }
  const token = crypto.randomUUID();
  writeStored(TOKEN_KEY, token);
  return token;
}

/**
 * Forgets this device's token, so the next thing to ask for one gets a new one.
 *
 * Called when signing out. The account that just left has claimed this token,
 * and leaving it in place would hand the next person to sign in on this device
 * the previous one's anonymous history — harmless when an account was optional
 * and sharing a device was unusual, and neither once every game against a
 * person is attributed and the device is the one the family passes around.
 */
export function resetPlayerToken(): void {
  writeStored(TOKEN_KEY, crypto.randomUUID());
}

/**
 * How long this player likes a sitting to be.
 *
 * A preference rather than a decision: at a table with somebody else it is one
 * of two, and the shorter one wins — see `formatFor` on the server. Rubber is
 * the default because it is the game this was built to play.
 */
export function preferredFormat(): MatchFormat {
  return readStored(FORMAT_KEY) === "game" ? "game" : "rubber";
}

export function setPreferredFormat(format: MatchFormat): void {
  writeStored(FORMAT_KEY, format);
}

/**
 * Whether the computer is allowed to bid a suit it does not hold.
 *
 * **Temporary, and here to answer one question.** Measured against the bot,
 * psyching costs about ten times what it earns: the lie does land — the sampler
 * reads the auction and misplays by a measurable amount — but contracts that
 * were makeable fall four points, because one pass closes the auction and a suit
 * you do not hold is sometimes a suit you play.
 *
 * None of which settles whether it works on a *person*, who forms a far stronger
 * belief from an auction than a weighted sampler does and holds it much longer.
 * That is not measurable from here, so it is a switch instead. Once it has been
 * played with, this and the row in Settings should both go: whichever way it
 * lands, the answer belongs in the bot rather than in a preference.
 */
export function psychsEnabled(): boolean {
  return readStored(PSYCHS_KEY) === "on";
}

export function setPsychsEnabled(enabled: boolean): void {
  writeStored(PSYCHS_KEY, enabled ? "on" : "off");
}

/**
 * The three settings that exist to answer a question, not to be preferred.
 *
 * Each is a number the benches cannot choose. What a game in hand is worth was
 * fitted against a reference bidder that barely doubles, so its measured
 * optimum flatters overbidding in a way that will not transfer to a person. How
 * strong the computer should be is not a measurement at all — more sampling is
 * always better play and says nothing about whether the result is worth
 * sitting down to. And the pace of the draw is twenty-six turns of the same
 * decision, which either reads as deliberate or as waiting, and no number
 * produced from a bench has an opinion about which.
 *
 * All three are temporary. When each has an answer it belongs in the code as a
 * constant, and the row should go.
 */
export type Boldness = "bold" | "cautious" | "normal";
export type Strength = "normal" | "strong" | "weak";
export type Pace = "brisk" | "normal" | "slow";

export function boldness(): Boldness {
  const stored = readStored(BOLDNESS_KEY);
  return stored === "bold" || stored === "cautious" ? stored : "normal";
}

export function setBoldness(next: Boldness): void {
  writeStored(BOLDNESS_KEY, next);
}

export function strength(): Strength {
  const stored = readStored(STRENGTH_KEY);
  return stored === "strong" || stored === "weak" ? stored : "normal";
}

export function setStrength(next: Strength): void {
  writeStored(STRENGTH_KEY, next);
}

/**
 * Whether to show the computer's cards.
 *
 * Stored, like every other row in Settings. It was component state while it was
 * a development affordance — nothing that vanished on reload, because a reload
 * meant a rebuild anyway. As a setting somebody can actually turn on that made
 * it the one row that forgot itself, which reads exactly like a control that
 * does not work.
 *
 * **On by default on the dev server, off by default anywhere else.** It shows
 * what the computer is up to and changes nothing about what it does, so locally
 * it is wanted on nearly every run — and a stored choice still wins, which is
 * what leaves the shipped experience reachable by turning it off rather than by
 * building without it.
 */
export function peeking(): boolean {
  const stored = readStored(PEEK_KEY);
  return stored === null ? import.meta.env.DEV : stored === "on";
}

export function setPeeking(enabled: boolean): void {
  writeStored(PEEK_KEY, enabled ? "on" : "off");
}

export function pace(): Pace {
  const stored = readStored(PACE_KEY);
  return stored === "brisk" || stored === "slow" ? stored : "normal";
}

export function setPace(next: Pace): void {
  writeStored(PACE_KEY, next);
}

/**
 * What this device calls the player when there is no account to ask.
 *
 * Since §3.7 that is only the game against the computer, which needs no server
 * and so has nothing to look a name up in. At a table the name comes from the
 * account, and the server reads it there rather than believing this. It is also
 * what the name prompt starts from, so somebody who has been playing the
 * computer as "Eric" is not asked the question from scratch.
 */
export function nickname(): string {
  return readStored(NICKNAME_KEY) ?? "";
}

export function setNickname(value: string): void {
  writeStored(NICKNAME_KEY, value.trim().slice(0, 20));
}
