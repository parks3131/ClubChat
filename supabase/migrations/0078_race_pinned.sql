-- Lets an admin pin a race so it carries a pin indicator on the club
-- hub's "Races and Meets" preview (and the "See all" search popup, same
-- row component). No new RLS policy needed — the existing "admins can
-- update races" policy (0016_races.sql) already covers any column on
-- the row, this one included.
alter table public.races add column pinned boolean not null default false;
