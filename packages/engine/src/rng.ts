/**
 * Deterministic pseudo-random number generation.
 *
 * The engine never calls `Math.random` directly. Every source of randomness is
 * an explicit seeded generator, so a deal can be reproduced exactly from its
 * seed — which is what makes shuffling testable, and what lets a server
 * reconstruct a table's deal after a restart.
 */

export interface Rng {
  /** Returns a float in [0, 1). */
  next(): number;
}

/**
 * mulberry32 — small, fast, and good enough for shuffling a deck of cards.
 * Not cryptographically secure; deal seeds must therefore be generated
 * server-side and never exposed to clients, or a player could reconstruct the
 * stock order.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Fisher-Yates. Returns a new array; the input is not mutated. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = result[i]!;
    const b = result[j]!;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** A seed suitable for a fresh deal. Uses `Math.random`, so callers own the determinism boundary. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
