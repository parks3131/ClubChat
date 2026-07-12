-- New pending-request-inbox notifications — three brand-new triggers,
-- nothing existing modified. Each fires on `insert or update of status`
-- with `when (new.status = 'pending')`, so it catches both a fresh
-- request (inserted as 'pending' by default) and a re-request after a
-- prior denial (which flips status back to 'pending' via an UPDATE, the
-- `on conflict do update` branch in join_or_request_club/
-- request_join_race/request_join_eboard_channel). It deliberately does
-- NOT fire when decide_*_join_request moves status away from 'pending'
-- (to 'approved'/'denied') — that transition already gets its own
-- notification from 0032's decide_*_join_request functions directly.
--
-- The audience differs per request type, matching the exact approval
-- population each type already has: club/race requests fan out to every
-- admin of the club (races have no separate admin role — see
-- 0016_races.sql), while Eboard requests fan out only to *current*
-- Eboard members, since only existing members (not every club admin) can
-- decide those (see 0017_eboard.sql's asymmetric approval rights).

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
    '/clubs/' || new.club_id || '/club-profile'
  from public.club_members cm
  where cm.club_id = new.club_id and cm.role = 'admin';

  return new;
end;
$$;

create trigger on_club_join_request_pending
  after insert or update of status on public.club_join_requests
  for each row when (new.status = 'pending')
  execute function public.notify_club_join_request();

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
  where cm.club_id = race_row.club_id and cm.role = 'admin';

  return new;
end;
$$;

create trigger on_race_join_request_pending
  after insert or update of status on public.race_join_requests
  for each row when (new.status = 'pending')
  execute function public.notify_race_join_request();

create or replace function public.notify_eboard_join_request()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requester_name text;
  eboard_club_id uuid;
begin
  select full_name into requester_name from public.profiles where id = new.user_id;
  select club_id into eboard_club_id from public.eboard_channels where id = new.eboard_channel_id;

  insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
  select
    ecm.user_id, new.user_id, eboard_club_id, 'eboard_join_request',
    coalesce(requester_name, 'Someone') || ' wants to join the Eboard',
    '/clubs/' || eboard_club_id || '/eboard/roster'
  from public.eboard_channel_members ecm
  where ecm.eboard_channel_id = new.eboard_channel_id;

  return new;
end;
$$;

create trigger on_eboard_join_request_pending
  after insert or update of status on public.eboard_channel_join_requests
  for each row when (new.status = 'pending')
  execute function public.notify_eboard_join_request();
