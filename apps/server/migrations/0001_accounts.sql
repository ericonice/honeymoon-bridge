-- Accounts and the sign-in links that create them.
--
-- Accounts are optional (§2.1): the game against the computer needs no server
-- at all, and somebody opening an invite should be playing in seconds rather
-- than signing up. An account buys durable identity across devices and a record
-- that survives clearing browser data. It never gates a game.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  -- The only personal data this project holds. Stored because a magic link has
  -- to be sent somewhere, and for nothing else: no name, no marketing.
  -- Lower-cased on the way in so one person cannot end up with two accounts.
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- The anonymous device tokens an account has claimed.
--
-- A token exists before any account does — it is what seats you at a table and
-- what a record is already attached to. Signing in therefore *claims* the token
-- rather than replacing it, or the first thing an account would do is wipe the
-- history it was created to keep.
CREATE TABLE account_tokens (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  claimed_at INTEGER NOT NULL
);

CREATE INDEX account_tokens_by_account ON account_tokens(account_id);

-- Outstanding sign-in links.
--
-- Only a hash of the token is kept, so a copy of this table grants nobody a
-- login. `used_at` makes a link single-use, and `expires_at` kills one left
-- sitting in an inbox.
CREATE TABLE magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX magic_links_by_expiry ON magic_links(expires_at);
