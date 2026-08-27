import type {
  AuctionEntry,
  Card,
  CompletedTrick,
  Contract,
  MatchFormat,
  DrawTurnRecord,
  Level,
  Pair,
  PlayerId,
  RubberState,
  Strain,
} from "@hb/engine";
import type { Env } from "./env.js";

/**
 * The house rules a deal was played under, for the deals played while there were
 * any.
 *
 * The open discard was withdrawn (§3.6b), so the engine has no such type any more
 * and no current client sends this — but the deals already logged under it really
 * were played under it, and a bench pooling them with deals of the game as
 * specified would report a number describing neither. Declared here rather than
 * imported for exactly that reason: it describes what is in the table, not what
 * the rules are.
 */
export interface LoggedDealRules {
  readonly openDiscard: boolean;
}

/** A completed robot-game deal, as the browser that played it saw it. */
export interface HandLog {
  readonly auction: readonly AuctionEntry[];
  readonly boldness: string;
  readonly botVersion: number;
  readonly completedTricks: readonly CompletedTrick[];
  readonly contract: Contract;
  readonly deviceToken: string;
  /**
   * Which rung it was played on. Absent from a build that predates the setting,
   * and that is not the same as a rung nobody recognises — `simpleBidder` means
   * the bottom rung is a different bidder, so pooling rungs pools opponents.
   */
  readonly difficulty?: string;
  readonly disguise: boolean;
  /** Absent from a build that predates them — see `handLogFrom`. */
  readonly drawTurns?: readonly DrawTurnRecord[];
  readonly initialHands: Pair<readonly Card[]>;
  /**
   * What was being played. Absent from a build that predated more than one format,
   * which means a rubber — the only thing there was.
   *
   * Load-bearing for a replay rather than a label: `objectiveFor` reads it to decide
   * what the bidder was pricing in, and a session's call replayed as a rubber's is a
   * different decision with the same auction in front of it.
   */
  readonly format?: MatchFormat;
  /** Set only by a build that had house rules to report — see `LoggedDealRules`. */
  readonly rules?: LoggedDealRules;
  readonly seed?: number;
  readonly standing?: HandLogStanding;
  readonly starter?: PlayerId;
  /** The dial that preceded the difficulty ladder. Absent from any current client. */
  readonly strength?: string;
  readonly tricksWon: Pair<number>;
}

/** The score a deal was bid at. Nothing about a call can be replayed without it. */
export interface HandLogStanding {
  /**
   * The rubber the deal was bid at, or absent for a duplicate deal — a session has
   * no rubber to have been at.
   *
   * Optional rather than a fresh rubber standing in for one, which would be a lie in
   * stored data: a bench reading it would price a session's call against a standing
   * that never existed. What a duplicate call actually needs is `vulnerable`, which
   * a board prescribes, and that is here either way.
   */
  readonly rubber?: RubberState;
  readonly vulnerable: Pair<boolean>;
}

/**
 * Writes one logged deal down.
 *
 * `account_id` is whoever was signed in when it was reported, same as
 * `recordRubber` — null for a device that never has been, since logging a
 * hand never requires an account any more than reporting a robot rubber does.
 * The normalized columns exist for cheap filtering later (which bot version,
 * who declared, whether it made); everything a replay needs — both hands, the
 * auction, every trick — is the caller's `deal_json`, the one thing here with
 * exactly one reader.
 */
export async function recordHandLog(
  env: Env,
  log: HandLog,
  accountId: string | null,
  dealJson: string,
  now: number,
): Promise<void> {
  const madeTricks =
    log.contract.level + 6 <= log.tricksWon[log.contract.declarer] ? 1 : 0;

  await env.DB.prepare(
    `INSERT INTO hand_logs
       (id, played_at, account_id, device_token, bot_version, boldness, strength,
        disguise, declarer, contract_level, contract_strain, made, tricks_declarer,
        difficulty, deal_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      now,
      accountId,
      log.deviceToken,
      log.botVersion,
      log.boldness,
      // The column is NOT NULL and SQLite cannot drop that without rebuilding
      // the table, so absent is written as the empty string and read back as
      // null. Not worth a table rebuild for a dial no current client sends.
      log.strength ?? "",
      log.disguise ? 1 : 0,
      log.contract.declarer,
      log.contract.level,
      log.contract.strain,
      madeTricks,
      log.tricksWon[log.contract.declarer],
      log.difficulty ?? null,
      dealJson,
    )
    .run();
}

/** The part of a logged deal a replay actually needs — what `deal_json` holds. */
export interface HandLogDeal {
  readonly auction: readonly AuctionEntry[];
  readonly completedTricks: readonly CompletedTrick[];
  readonly contract: Contract;
  readonly drawTurns?: readonly DrawTurnRecord[];
  readonly format?: MatchFormat;
  readonly initialHands: Pair<readonly Card[]>;
  readonly rules?: LoggedDealRules;
  readonly seed?: number;
  readonly standing?: HandLogStanding;
  readonly starter?: PlayerId;
  readonly tricksWon: Pair<number>;
}

export interface HandLogRow {
  readonly boldness: string;
  readonly botVersion: number;
  readonly contractLevel: Level;
  readonly contractStrain: Strain;
  readonly deal: HandLogDeal;
  readonly declarer: PlayerId;
  /** Which rung it was played on. Null from before the column existed. */
  readonly difficulty: string | null;
  readonly disguise: boolean;
  readonly id: string;
  readonly made: boolean;
  readonly playedAt: number;
  /** Null where the client did not send one, which is every current build. */
  readonly strength: string | null;
  readonly tricksDeclarer: number;
}

interface HandLogRecord {
  readonly boldness: string;
  readonly bot_version: number;
  readonly contract_level: Level;
  readonly contract_strain: Strain;
  readonly deal_json: string;
  readonly difficulty: string | null;
  readonly declarer: PlayerId;
  readonly disguise: number;
  readonly id: string;
  readonly made: number;
  readonly played_at: number;
  readonly strength: string;
  readonly tricks_declarer: number;
}

/**
 * The most recently logged deals, for looking at what a later assessment pass
 * will actually see — not scoped to any one account, since the point is every
 * hand anyone has played against the computer. Gated by the caller, the same
 * way `/api/hands/log` is not: this reads back what that route wrote, and
 * both sides of that are covered by the same trust boundary.
 */
export async function handLogsFor(env: Env, limit: number): Promise<readonly HandLogRow[]> {
  const rows = await env.DB.prepare(
    `SELECT id, played_at, bot_version, boldness, strength, disguise, declarer,
            contract_level, contract_strain, made, tricks_declarer, difficulty, deal_json
     FROM hand_logs ORDER BY played_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<HandLogRecord>();

  return rows.results.map((row) => ({
    boldness: row.boldness,
    botVersion: row.bot_version,
    contractLevel: row.contract_level,
    contractStrain: row.contract_strain,
    deal: JSON.parse(row.deal_json) as HandLogDeal,
    declarer: row.declarer,
    difficulty: row.difficulty,
    disguise: row.disguise === 1,
    id: row.id,
    made: row.made === 1,
    playedAt: row.played_at,
    strength: row.strength === "" ? null : row.strength,
    tricksDeclarer: row.tricks_declarer,
  }));
}
