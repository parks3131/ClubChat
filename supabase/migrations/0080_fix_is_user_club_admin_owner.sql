-- R4: is_user_club_admin excluded the club Owner.
--
-- This two-argument helper validates the *target* of a direct-add to an
-- eboard channel (see 0017_eboard.sql): "is the person I'm adding actually a
-- club admin?", since eboard membership must always be a subset of club
-- admins. It was written in 0017 with `role = 'admin'` and never widened when
-- the Owner tier landed in 0043 - so an eboard member could not add the club
-- Owner through the client, because the target check returned false for them.
--
-- 0043 recreated the one-argument is_club_admin(p_club_id) with
-- `role in ('admin','owner')` but missed this two-argument sibling. This is
-- the fifth instance of the exact `role = 'admin'` omission after the Owner
-- tier was added (prior four: notify_club_join_request / notify_race_join_request
-- in 0046, notify_announcement / notify_poll_created in 0048).
--
-- Owner is a strict superset of Admin for every authorization check, so the
-- fix is the same one-line widening applied everywhere else.
create or replace function public.is_user_club_admin(p_club_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = p_user_id and role in ('admin', 'owner')
  );
$$;
