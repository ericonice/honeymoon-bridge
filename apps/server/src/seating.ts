/** A verified account, and what it is called at a table. */
export interface SeatedAccount {
  readonly id: string;
  readonly name: string | null;
}

/**
 * Why this person may not take a seat, or null if they may.
 *
 * The whole of §3.7's gate, kept out of `table.ts` so it can be tested without
 * a Durable Object: the rule is the part worth pinning down, and the object
 * around it is exercised against a real `wrangler dev`.
 *
 * A name is required as well as an account, because the table shows one to the
 * other player and every result records it. It is asked for immediately after
 * the first sign-in, so arriving here without one means a client that skipped
 * the step rather than somebody who still has to be walked through it — hence a
 * refusal rather than a seat with a placeholder in it.
 *
 * This decides only whether somebody may *take* a seat. Getting back into one
 * already held is a question about the device token, and deliberately does not
 * come through here at all.
 */
export function refuseSeat(account: SeatedAccount | null): string | null {
  if (account === null) {
    return "Sign in to take a seat";
  }
  return account.name === null ? "Choose a name before taking a seat" : null;
}
