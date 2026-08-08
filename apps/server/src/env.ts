import type { Lobby } from "./lobby.js";
import type { Table } from "./table.js";

export interface Env {
  /** Accounts and, later, results. Queries across players are not a table's job. */
  readonly DB: D1Database;
  /** One instance for the whole game — see `Lobby`. */
  readonly LOBBY: DurableObjectNamespace<Lobby>;
  /** Secret: sends the sign-in emails. */
  readonly RESEND_API_KEY: string;
  /** Secret: signs session tokens, so no session table is needed. */
  readonly SESSION_SECRET: string;
  readonly TABLES: DurableObjectNamespace<Table>;
}
