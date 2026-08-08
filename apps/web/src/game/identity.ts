import type { MatchFormat } from "@hb/engine";
import { readStored, writeStored } from "./storage.js";

const FORMAT_KEY = "hb.format";
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
