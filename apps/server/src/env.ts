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
  /**
   * Secret: the addresses allowed to see unfinished settings, comma separated.
   *
   * Named for the people rather than the features on purpose. A list of
   * experiments and a list of the people who see them are different things, and
   * a name that suggests the first while holding the second is a trap for
   * whoever reads it next.
   *
   * A secret rather than a `vars` entry because `wrangler.jsonc` is committed
   * and these are people's email addresses; a secret also survives a deploy,
   * where a dashboard-set plaintext var does not unless `keep_vars` is on.
   * Absent means nobody, which is the right answer when there is no
   * configuration.
   *
   * **This is not a security boundary.** It decides which rows a Settings screen
   * offers, and every one of those rows changes how the computer opponent
   * behaves in a game played entirely on the player's own device. Somebody
   * determined to flip one can flip it from devtools regardless. It exists so
   * that half-finished behavior is not put in front of everybody, not to keep
   * anyone out of anything.
   */
  readonly PLAYTESTERS?: string;
  /** One instance for the whole game — see `Lobby`. */
  readonly LOBBY: DurableObjectNamespace<Lobby>;
  /** Secret: sends the sign-in emails. */
  readonly RESEND_API_KEY: string;
  /** Secret: signs session tokens, so no session table is needed. */
  readonly SESSION_SECRET: string;
  readonly TABLES: DurableObjectNamespace<Table>;
}
