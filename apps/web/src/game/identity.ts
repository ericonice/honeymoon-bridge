const TOKEN_KEY = "hb.token";
const NICKNAME_KEY = "hb.nickname";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Safari in private mode throws rather than returning null.
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The value still holds for this session, which is enough to finish a game.
  }
}

/**
 * The opaque value that reclaims a seat after a dropped socket.
 *
 * This is the whole of identity — §2.2 has no accounts, no passwords and no
 * email. The accepted cost is that a rubber is bound to the device that started
 * it: clearing browser data or moving to another phone forfeits the seat, and
 * there is deliberately no way to recover one, because a recoverable seat would
 * need an account to recover it to.
 */
export function playerToken(): string {
  const existing = read(TOKEN_KEY);
  if (existing !== null && existing !== "") {
    return existing;
  }
  const token = crypto.randomUUID();
  write(TOKEN_KEY, token);
  return token;
}

export function nickname(): string {
  return read(NICKNAME_KEY) ?? "";
}

export function setNickname(value: string): void {
  write(NICKNAME_KEY, value.trim().slice(0, 20));
}
