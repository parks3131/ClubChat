-- Location & Accommodation, the last of Race's four originally-
-- placeholder sections (task #16) to get scoped. Same minimal-table
-- approach as task #20's photos_link/results_link: three nullable
-- columns directly on races rather than a new table, since it's just a
-- handful of optional fields with no list/membership shape to them. No
-- new RLS needed — the existing "admins can update races" policy from
-- 0016_races.sql already covers any column on the row, so any admin (not
-- just whoever wrote it) can edit.
alter table public.races add column info_description text;
alter table public.races add column location_link text;
alter table public.races add column hotel_link text;
