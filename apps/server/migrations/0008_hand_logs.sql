-- Every completed robot-game deal, for assessing the bot against real hands
-- rather than only self-play.
--
-- Every bench in `apps/web/bench/` measures the bot against deals it generated
-- itself. That is what caught the no-trump regression and the sacrifice
-- miscalibration, but it can only ever be as representative of a real table as
-- a random deal is. `bench/par.ts`'s mistake-finding already works from a
-- finished deal's own shape — both hands as dealt, the auction, the contract,
-- every card played — so logging that same shape from a deal actually played
-- is enough to run the identical analysis later against real hands.
--
-- Trusted client report, exactly like `results` and `achievement_*`: bounded
-- and typed on the way in, not verified against anything, since nothing here
-- watched the deal happen. Scoped to the robot game only — a networked deal has
-- no bot decision in it to assess, and the server is already the authority
-- there if that ever changes.
--
-- A handful of columns are normalized for cheap filtering (which bot version,
-- who declared, whether it made); the rest — both hands, the auction, every
-- trick — sits in `deal_json` as the one thing here nothing queries a piece of,
-- only replays wholesale. Every other table in this schema is fully
-- normalized; this is the first JSON-in-a-column here, and deliberately so —
-- normalizing trick-by-trick play into rows would be a lot of new schema for
-- data with exactly one reader.

CREATE TABLE hand_logs (
  id TEXT PRIMARY KEY,
  played_at INTEGER NOT NULL,
  -- Null for a device that has never signed in — logging never requires it,
  -- the same way reporting a robot rubber never has.
  account_id TEXT REFERENCES accounts(id),
  device_token TEXT NOT NULL,
  bot_version INTEGER NOT NULL,
  boldness TEXT NOT NULL,
  strength TEXT NOT NULL,
  disguise INTEGER NOT NULL,
  -- 0 or 1: the seat that declared.
  declarer INTEGER NOT NULL,
  contract_level INTEGER NOT NULL,
  contract_strain TEXT NOT NULL,
  made INTEGER NOT NULL,
  tricks_declarer INTEGER NOT NULL,
  deal_json TEXT NOT NULL
);

CREATE INDEX hand_logs_by_bot_version ON hand_logs(bot_version);
CREATE INDEX hand_logs_by_account ON hand_logs(account_id);
