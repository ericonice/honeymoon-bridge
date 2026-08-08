import type { MatchFormat } from "@hb/engine";
import { readStored, writeStored } from "./storage.js";

const FORMAT_KEY = "hb.format";
const NICKNAME_KEY = "hb.nickname";
const TOKEN_KEY = "hb.token";

/**
 * The opaque value that reclaims a seat after a dropped socket.
 *
 * This remains the whole of identity as far as a game is concerned: a seat is
 * held by a device, an invite works for someone who has never signed in, and
 * nothing here gates play. Signing in adds a durable name for a player, not a
 * requirement to be one.
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

export function nickname(): string {
  return readStored(NICKNAME_KEY) ?? "";
}

export function setNickname(value: string): void {
  writeStored(NICKNAME_KEY, value.trim().slice(0, 20));
}
