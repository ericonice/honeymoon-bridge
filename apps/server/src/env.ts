import type { Lobby } from "./lobby.js";
import type { Table } from "./table.js";

export interface Env {
  /** One instance for the whole game — see `Lobby`. */
  readonly LOBBY: DurableObjectNamespace<Lobby>;
  readonly TABLES: DurableObjectNamespace<Table>;
}
