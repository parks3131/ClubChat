-- Club picture, shown on the new club-profile screen. Editing (including
-- this column) is already gated by the existing "admins can update their
-- club" UPDATE policy on clubs from 0003_rls.sql — no RLS change needed.
alter table public.clubs
  add column avatar_url text;
