-- Finished rubbers, which are what "my record against you" is made of.
--
-- A rubber rather than a deal is the unit, because a rubber is what people say
-- they won. Deals are visible on the scorepad while one is being played and are
-- not worth keeping afterwards: nobody asks how many deals they have won.
--
-- Only completed rubbers land here. §2.2 says an abandoned rubber ends unscored
-- and the table is discarded, so there is nothing to record and deliberately no
-- way to earn a record by walking out of a game going badly.

CREATE TABLE results (
  id TEXT PRIMARY KEY,
  finished_at INTEGER NOT NULL,
  -- Kept for tracing a row back to a game someone remembers playing. The table
  -- itself is long gone by then; a Durable Object is discarded when the rubber
  -- ends.
  table_code TEXT NOT NULL,
  -- 0 or 1, the seat that won.
  winner INTEGER NOT NULL,
  deals INTEGER NOT NULL,

  -- Both seats, recorded twice over.
  --
  -- The account is who was signed in *at the time*, and is null for somebody
  -- playing anonymously — which is most rubbers, since an account has never
  -- been required to play.
  --
  -- The token is always there, and is what makes an anonymous rubber
  -- recoverable: `account_tokens` records the tokens an account has claimed, so
  -- signing in later attaches the games already played on that device. This is
  -- the whole reason signing in claims a token rather than replacing it, and
  -- storing only the account here would throw that away.
  account0 TEXT REFERENCES accounts(id),
  token0 TEXT NOT NULL,
  nickname0 TEXT NOT NULL,
  points0 INTEGER NOT NULL,

  account1 TEXT REFERENCES accounts(id),
  token1 TEXT NOT NULL,
  nickname1 TEXT NOT NULL,
  points1 INTEGER NOT NULL
);

-- Every lookup is "the rubbers this person was in", and a person is either seat.
CREATE INDEX results_by_account0 ON results(account0);
CREATE INDEX results_by_account1 ON results(account1);
CREATE INDEX results_by_token0 ON results(token0);
CREATE INDEX results_by_token1 ON results(token1);
