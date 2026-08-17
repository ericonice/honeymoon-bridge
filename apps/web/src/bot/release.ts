/**
 * Which bot this is.
 *
 * A record against "the computer" pooled across every computer there has ever
 * been is not a record — the same objection §3.7 makes about accounts, that
 * results which only sometimes attach are not results. Versions are numbered
 * from one and named alphabetically after hockey players, so the ordering is
 * unmistakable to anybody reading a list of them.
 *
 * The name is for Settings, beside the version, and nowhere else. Across the
 * table the opponent stays the computer: a player is sitting down against a
 * machine, not against somebody called Angela James, and putting a name in the
 * seat opposite would promise a personality that is not there.
 *
 * Bump this whenever the bot's play changes enough that results before and
 * after are not measuring the same opponent. It cannot be applied backwards —
 * every rubber recorded before this existed has no version and never will.
 */
export interface BotRelease {
  /**
   * Shown in Settings, in full. Ordered alphabetically by *first* name — Angela
   * James, Bobby Orr, Cammi Granato, Doug Harvey, Eddie Shore, Frank Mahovlich,
   * Gordie Howe, Hayley Wickenheiser, Igor Larionov, Jean Béliveau — so that a
   * list of versions reads in the order they existed.
   */
  readonly name: string;
  readonly version: number;
}

export const BOT_RELEASE: BotRelease = {
  name: "Bobby Orr",
  version: 2,
};
