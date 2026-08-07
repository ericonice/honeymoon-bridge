/**
 * Characters that survive being read aloud, written down and typed back in.
 *
 * No 0/O, no 1/I/L: an invite gets sent as a link, but it also gets read across
 * a room, and a code that has to be spelled twice is a worse code.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const CODE_LENGTH = 6;

/**
 * A table's invite code, which is also the name of its Durable Object.
 *
 * Thirty-one characters to the sixth is about 900 million, and there is no
 * lobby and no enumeration — a code is only useful to someone who was sent it.
 * Guessing one to land in a stranger's game is not a threat worth a longer
 * code, and the cost of a longer code is real: it is typed on a phone.
 */
export function inviteCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** Whether a string could be a code at all, before a Durable Object is woken for it. */
export function isInviteCode(value: string): boolean {
  return value.length === CODE_LENGTH && [...value].every((c) => ALPHABET.includes(c));
}

/** A deal seed. Never sent to a client: it reconstructs the whole stock order. */
export function dealSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0]!;
}
