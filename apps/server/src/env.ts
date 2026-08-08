import type { Lobby } from "./lobby.js";
import type { Table } from "./table.js";

export interface Env {
  /** Accounts and, later, results. Queries across players are not a table's job. */
  readonly DB: D1Database;
  /**
   * Set only by the `dev` script, which turns on signing in without email.
   *
   * Optional and checked for a specific value, so the absence of any config at
   * all is the safe answer. It is deliberately not a `vars` entry in
   * `wrangler.jsonc` with a production value to override — that is one edit away
   * from shipping an authentication bypass, and this is one edit away from
   * nothing. See §3.6 for why this is the dev control that does not ship.
   */
  readonly DEV_SIGNIN?: string;
  /** One instance for the whole game — see `Lobby`. */
  readonly LOBBY: DurableObjectNamespace<Lobby>;
  /** Secret: sends the sign-in emails. */
  readonly RESEND_API_KEY: string;
  /** Secret: signs session tokens, so no session table is needed. */
  readonly SESSION_SECRET: string;
  readonly TABLES: DurableObjectNamespace<Table>;
}
