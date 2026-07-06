-- Photos and Result Link, two more of Race's originally-placeholder
-- sections (task #16). Both are the same simple shape: a single optional
-- URL, any race admin can add/edit/delete it (not creator-restricted,
-- unlike Eboard meetings — the founder's spec for this one was "any admin
-- can edit or delete"), visible read-only to everyone with race access.
-- No new table needed — just two nullable columns on races, and no new
-- RLS either: the existing "admins can update races" policy from
-- 0016_races.sql already covers whatever columns are on the row.
alter table public.races add column photos_link text;
alter table public.races add column results_link text;
