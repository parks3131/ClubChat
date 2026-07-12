-- Founder follow-up right after the Notifications feature's own live
-- verification pass: a decided join-request notification should stay
-- visible as history ("Approved"/"Denied"), not disappear the way
-- 0032_notification_triggers_membership.sql's decide_*_join_request
-- functions were just fixed to do (they DELETEd the pending admin-inbox
-- notification once decided). This migration reverses that specific
-- behavior — the notification now stays and gets tagged with its
-- outcome instead of being removed.

alter table public.notifications
  add column resolved_outcome text check (resolved_outcome in ('approved', 'denied'));

create or replace function public.decide_join_request(request_id uuid, approve boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  req public.club_join_requests;
  actor_id uuid := auth.uid();
  actor_name text;
  club_name text;
begin
  select * into req from public.club_join_requests where id = request_id;
  if req.id is null then
    raise exception 'Request not found';
  end if;
  if not public.is_club_admin(req.club_id) then
    raise exception 'Not authorized';
  end if;

  update public.club_join_requests
  set status = case when approve then 'approved' else 'denied' end,
      decided_at = now(),
      decided_by = actor_id
  where id = request_id;

  select full_name into actor_name from public.profiles where id = actor_id;
  select name into club_name from public.clubs where id = req.club_id;

  -- Every admin's copy of the "X wants to join" notification is no
  -- longer actionable once decided, but stays visible as history —
  -- tagged with the outcome and marked read (it doesn't need to keep
  -- contributing to the unread badge once resolved). Scoped by
  -- target_path (which already encodes this exact club) + actor_id (the
  -- requester), since notifications has no direct request_id column to
  -- key on (see 0031's target_path design note).
  update public.notifications
  set resolved_outcome = case when approve then 'approved' else 'denied' end,
      read_at = coalesce(read_at, now())
  where type = 'club_join_request'
    and target_path = '/clubs/' || req.club_id || '/club-profile'
    and public.notifications.actor_id = req.user_id;

  if approve then
    perform set_config('clubchat.skip_add_notify', 'true', true);

    insert into public.club_members (club_id, user_id, role)
    values (req.club_id, req.user_id, 'member')
    on conflict (club_id, user_id) do nothing;

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (
      req.user_id, actor_id, req.club_id, 'request_approved',
      'Your request to join ' || coalesce(club_name, 'a club') || ' was approved by ' || coalesce(actor_name, 'an admin'),
      '/clubs/' || req.club_id
    );
  else
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (
      req.user_id, actor_id, req.club_id, 'request_denied',
      'Your request to join ' || coalesce(club_name, 'a club') || ' was denied by ' || coalesce(actor_name, 'an admin'),
      '/clubs'
    );
  end if;
end;
$$;

create or replace function public.decide_race_join_request(request_id uuid, approve boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  req public.race_join_requests;
  race_row public.races;
  actor_id uuid := auth.uid();
  actor_name text;
begin
  select * into req from public.race_join_requests where id = request_id;
  if req.id is null then
    raise exception 'Request not found';
  end if;
  if not public.is_race_admin(req.race_id) then
    raise exception 'Not authorized';
  end if;

  update public.race_join_requests
  set status = case when approve then 'approved' else 'denied' end,
      decided_at = now(),
      decided_by = actor_id
  where id = request_id;

  select * into race_row from public.races where id = req.race_id;
  select full_name into actor_name from public.profiles where id = actor_id;

  update public.notifications
  set resolved_outcome = case when approve then 'approved' else 'denied' end,
      read_at = coalesce(read_at, now())
  where type = 'race_join_request'
    and target_path = '/clubs/' || race_row.club_id || '/race/' || req.race_id || '/roster'
    and public.notifications.actor_id = req.user_id;

  if approve then
    perform set_config('clubchat.skip_add_notify', 'true', true);

    insert into public.race_members (race_id, user_id)
    values (req.race_id, req.user_id)
    on conflict (race_id, user_id) do nothing;

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (
      req.user_id, actor_id, race_row.club_id, 'request_approved',
      'Your request to join ' || coalesce(race_row.name, 'a race') || ' was approved by ' || coalesce(actor_name, 'an admin'),
      '/clubs/' || race_row.club_id || '/race/' || req.race_id
    );
  else
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (
      req.user_id, actor_id, race_row.club_id, 'request_denied',
      'Your request to join ' || coalesce(race_row.name, 'a race') || ' was denied by ' || coalesce(actor_name, 'an admin'),
      '/clubs/' || race_row.club_id || '/races'
    );
  end if;
end;
$$;

create or replace function public.decide_eboard_join_request(request_id uuid, approve boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  req public.eboard_channel_join_requests;
  eboard_club_id uuid;
  actor_id uuid := auth.uid();
  actor_name text;
begin
  select * into req from public.eboard_channel_join_requests where id = request_id;
  if req.id is null then
    raise exception 'Request not found';
  end if;
  if not public.is_eboard_member(req.eboard_channel_id) then
    raise exception 'Not authorized';
  end if;

  update public.eboard_channel_join_requests
  set status = case when approve then 'approved' else 'denied' end,
      decided_at = now(),
      decided_by = actor_id
  where id = request_id;

  select club_id into eboard_club_id from public.eboard_channels where id = req.eboard_channel_id;
  select full_name into actor_name from public.profiles where id = actor_id;

  update public.notifications
  set resolved_outcome = case when approve then 'approved' else 'denied' end,
      read_at = coalesce(read_at, now())
  where type = 'eboard_join_request'
    and target_path = '/clubs/' || eboard_club_id || '/eboard/roster'
    and public.notifications.actor_id = req.user_id;

  if approve then
    perform set_config('clubchat.skip_add_notify', 'true', true);

    insert into public.eboard_channel_members (eboard_channel_id, user_id)
    values (req.eboard_channel_id, req.user_id)
    on conflict (eboard_channel_id, user_id) do nothing;

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (
      req.user_id, actor_id, eboard_club_id, 'request_approved',
      'Your request to join the Eboard was approved by ' || coalesce(actor_name, 'an admin'),
      '/clubs/' || eboard_club_id || '/eboard'
    );
  else
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (
      req.user_id, actor_id, eboard_club_id, 'request_denied',
      'Your request to join the Eboard was denied by ' || coalesce(actor_name, 'an admin'),
      '/clubs/' || eboard_club_id || '/eboard'
    );
  end if;
end;
$$;
