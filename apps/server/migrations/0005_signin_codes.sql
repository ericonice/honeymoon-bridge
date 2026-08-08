-- A typed code beside the link, because on iOS the link cannot reach the app.
--
-- A home-screen web app on iOS has its own storage, separate from Safari's.
-- Mail opens a link in Safari, so the session a link creates lands in Safari
-- and the installed app is left exactly as it was — and since a link works
-- once, it cannot then be spent again in the right place. Nothing about
-- carrying the destination in the link helps: the session is in a container
-- the app cannot see.
--
-- A code is typed *into* whichever app asked for it, so it signs in the thing
-- the person is actually looking at. That is the whole of the fix.
--
-- Hashed, exactly like the link token: this table is not a place to keep
-- anything that grants a login. Null for rows written before this ran, which
-- simply have no code to enter.
ALTER TABLE magic_links ADD COLUMN code_hash TEXT;

-- Wrong guesses against this address's outstanding codes.
--
-- A code is six characters where a token is thirty-two bytes, so unlike the
-- link it is small enough to be worth guessing at. Counting attempts is what
-- keeps it small: five wrong tries burn every outstanding code for the address
-- and the person asks for another. Kept on the row rather than in a table of
-- its own because it dies with the code, and a code lives ten minutes.
ALTER TABLE magic_links ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
