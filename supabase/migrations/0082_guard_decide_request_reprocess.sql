-- The three decide_*_join_request RPCs (club, race, Eboard) had no idempotency
-- guard: deciding an already-decided request re-ran every side effect. Two admins
-- approving the same pending request produced TWO 'request_approved' notifications
-- to the requester, and decided_by recorded the LAST approver instead of the
-- first. The membership insert was already safe (`on conflict ... do nothing`),
-- but the notification insert and the decided_by write were not. All three share
-- the same shape (a race/Eboard join request is a club join request one level
-- down), so all three carried the identical bug and all three are fixed here.
--
-- Each is recreated verbatim from its current definition with one change: the
-- "mark decided" UPDATE now carries the `status = 'pending'` predicate itself,
-- and the function returns early when that UPDATE matches no row.
--
-- Why the predicate lives in the UPDATE, not just an early check on the value
-- read into `req`: under READ COMMITTED two simultaneous transactions both read
-- status='pending' before either commits, so an early check on the local
-- variable passes in both. Putting `status = 'pending'` in the UPDATE means the
-- second transaction blocks on the row lock, re-evaluates the predicate against
-- the first transaction's committed row once released, matches zero rows, and
-- returns - no duplicate notification, and decided_by keeps the FIRST decider.
-- Correct for both the common serialized case and the true concurrent race.

-- 1) Club join requests
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
  where id = request_id and status = 'pending';

  if not found then
    return;  -- already decided; idempotent no-op
  end if;

  select full_name into actor_name from public.profiles where id = actor_id;
  select name into club_name from public.clubs where id = req.club_id;

  update public.notifications
  set resolved_outcome = case when approve then 'approved' else 'denied' end,
      read_at = coalesce(read_at, now())
  where type = 'club_join_request'
    and target_path = '/clubs/' || req.club_id || '/club-profile/members'
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

-- 2) Race join requests
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
  where id = request_id and status = 'pending';

  if not found then
    return;  -- already decided; idempotent no-op
  end if;

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

-- 3) Eboard channel join requests
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
  where id = request_id and status = 'pending';

  if not found then
    return;  -- already decided; idempotent no-op
  end if;

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
