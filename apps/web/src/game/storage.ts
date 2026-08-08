/**
 * `localStorage`, with the one thing that actually goes wrong handled.
 *
 * Safari in private mode throws on write rather than returning null, and on a
 * phone that is a browsing mode people use rather than an edge case. Nothing
 * kept here is worth failing a game over, so every path degrades quietly to
 * "this session only".
 */

export function clearStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do. Whatever is there outlives us either way.
  }
}

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The caller keeps the value in memory, which is enough to finish a game.
  }
}
