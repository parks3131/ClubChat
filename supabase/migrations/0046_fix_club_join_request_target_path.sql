-- Two real bugs fixed together, both found while wiring up per-scope
-- notification read-tracking and live-verifying it against a lone-Owner
-- test club.
--
-- (1) club_join_request notifications (0033) have always pointed their
-- target_path at /clubs/{clubId}/club-profile, but that route is now
-- (club-profile/index.tsx was split into identity-only index.tsx +
-- members.tsx at some point after 0033 shipped, undocumented at the
-- time) just club identity — the pending-requests roster it was meant to
-- land on lives at /clubs/{clubId}/club-profile/members. Tapping the
-- notification silently landed on the wrong screen.
--
-- (2) notify_club_join_request and notify_race_join_request (0033) both
-- still filter `cm.role = 'admin'` to find their notification audience.
-- Task #42 (0043_club_role_owner.sql) introduced a 3-tier role system
-- and already re-patched several other functions with this exact same
-- bug (handle_new_eboard_channel, is_club_admin() itself) but missed
-- these two — so ever since 0043 shipped, a club with a lone Owner and
-- no separate Admins has *nobody* who gets notified about a pending
-- club or race join request. Confirmed live: created a fresh Owner-only
-- test club, requested to join as a second account, and the Owner's
-- notifications feed showed nothing at all — the club_join_requests row
-- existed (status='pending') but zero rows were ever inserted into
-- notifications. Both re-created (create or replace function, same
-- re-patch technique 0036/0038/0043 already used) with
-- `cm.role in ('admin', 'owner')` — no existing migration file edited.

create or replace function public.notify_club_join_request()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requester_name text;
  club_name text;
begin
  select full_name into requester_name from public.profiles where id = new.user_id;
  select name into club_name from public.clubs where id = new.club_id;

  insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
  select
    cm.user_id, new.user_id, new.club_id, 'club_join_request',
    coalesce(requester_name, 'Someone') || ' wants to join ' || coalesce(club_name, 'your club'),
    '/clubs/' || new.club_id || '/club-profile/members'
  from public.club_members cm
  where cm.club_id = new.club_id and cm.role in ('admin', 'owner');

  return new;
end;
$$;

create or replace function public.notify_race_join_request()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requester_name text;
  race_row public.races;
begin
  select full_name into requester_name from public.profiles where id = new.user_id;
  select * into race_row from public.races where id = new.race_id;

  insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
  select
    cm.user_id, new.user_id, race_row.club_id, 'race_join_request',
    coalesce(requester_name, 'Someone') || ' wants to join ' || coalesce(race_row.name, 'a race'),
    '/clubs/' || race_row.club_id || '/race/' || new.race_id || '/roster'
  from public.club_members cm
  where cm.club_id = race_row.club_id and cm.role in ('admin', 'owner');

  return new;
end;
$$;
