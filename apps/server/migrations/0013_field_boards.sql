-- The corpus a field session is played against — §1.8a.
--
-- A board here is a **seed and one side of it**. §1.8's board is a stock played
-- twice by the same player; this one is a stock played once, and the two streams of
-- that stock are separate boards with their own recorded results, because a single
-- run of a deal scores both seats. So one generated deal produces two rows here,
-- sharing a seed and differing in `starter`.
--
-- `starter` is which seat draws first, and the player always sits in seat 0 — so a
-- board with starter 0 hands them the stream that draws first and one with starter 1
-- hands them the other. That is what makes "which stream" a property of the board
-- rather than something a client has to be told separately and could get wrong.
--
-- `vulnerable_0` / `vulnerable_1` are carried rather than derived. A board must
-- always be played at the vulnerability its recorded results were played at, and a
-- rule computed at two ends is a rule that can drift at one of them.
--
-- `bot_version` and `difficulty` say **which computer set this board's first
-- entry**, and they are the reason boards are rows rather than a constant. A
-- benchmark is only a benchmark while the thing that set it is unchanged, and card
-- play is shared across releases — so a change there is a change of opponent, and
-- results made against the old one cannot be pooled with results made against the
-- new one. Boards are then generated afresh and the old ones stop being offered.
CREATE TABLE field_boards (
  id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  starter INTEGER NOT NULL,
  vulnerable_0 INTEGER NOT NULL,
  vulnerable_1 INTEGER NOT NULL,
  bot_version INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Both streams of one stock share a seed, which is how a board's twin is found:
-- playing one retires the other for that player, since every deal is played to
-- thirteen tricks and both hands are face up at the end.
CREATE INDEX field_boards_by_seed ON field_boards(seed);

-- Every result recorded on a board, the computer's own included.
--
-- **No seat column.** The board already fixes which stream is being played, so every
-- result on it is what somebody scored holding that stream — which is precisely what
-- makes them comparable to each other, and it is one fewer thing a client can get
-- wrong on the way in.
--
-- `generated` marks the computer's own entry, the one that exists before anybody has
-- played the board. It is not a different kind of result and is pooled with the rest;
-- the flag is there so a board with only its generated entry can be told apart from a
-- board somebody has actually met, which decides which boards get offered next.
--
-- `account_id` is null exactly for the generated row. A person's result always has
-- one, unlike `results` and `hand_logs` where a device that has never signed in can
-- still report: a field session is fetched from a route that needs a session, so
-- there is no anonymous path to record against.
CREATE TABLE field_results (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES field_boards(id),
  played_at INTEGER NOT NULL,
  account_id TEXT REFERENCES accounts(id),
  generated INTEGER NOT NULL,
  points INTEGER NOT NULL,
  -- Null together, for a deal that was passed out. A real result, and usually a bad
  -- one: solid play rarely passes a board out.
  declarer INTEGER,
  contract_level INTEGER,
  contract_strain TEXT,
  contract_doubling TEXT,
  tricks_0 INTEGER NOT NULL,
  tricks_1 INTEGER NOT NULL
);

CREATE INDEX field_results_by_board ON field_results(board_id);
CREATE INDEX field_results_by_account ON field_results(account_id);
