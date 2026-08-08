-- A display name on the account, and the IP a sign-in link was asked from.
--
-- 0001 says an account holds "no name, no marketing" and that it never gates a
-- game. Both are now false, and that migration is left as written: it records
-- what was true when it ran, and the reversal is described in §3.7 rather than
-- edited into the past.
--
-- The name is here because the alternative was showing an email address. With
-- nothing else to print, the record screen identified an opponent by their
-- address — the only place in this app where one player saw another's personal
-- data, and it happened for want of a name rather than by any decision. A name
-- is what somebody wants to be called across a table; an address is a
-- credential that happens to be readable.
--
-- Null means "not asked yet", which is every account that existed before this
-- ran. They are asked the next time they sign in. It is deliberately not
-- defaulted to something printable: a column full of "Player" would be
-- indistinguishable from a column of people who chose it.
ALTER TABLE accounts ADD COLUMN name TEXT;

-- Where a link was asked from, so that asking can be rate-limited by origin and
-- not only by address.
--
-- The per-address limit never protected the send quota: a script uses a
-- different address every time and never trips it. That was tolerable while
-- exhausting the quota merely cost money. It stopped being tolerable when
-- playing a person started to require a link, because from then on an exhausted
-- quota is the app being down.
--
-- Null for rows written before this, which simply do not count towards it.
ALTER TABLE magic_links ADD COLUMN requested_ip TEXT;

CREATE INDEX magic_links_by_ip ON magic_links(requested_ip, created_at);
