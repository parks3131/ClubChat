-- Extends the membership-event trigger functions (already re-created
-- twice before, in 0016 and 0017, to fix their "find the club's main
-- channel" lookup) a third time — same technique (`create or replace
-- function`, same trigger already attached, no trigger changes needed)
-- — to also insert a row into `notifications` (0031) alongside the
-- existing system chat message.
--
-- "Added by X" vs "your request was approved by X" needs to stay two
-- distinct notification texts (an explicit founder ask), but both are
-- driven by the exact same underlying INSERT into club_members/
-- race_members/eboard_channel_members — decide_*_join_request's approval
-- branch inserts the membership row itself, which is exactly what fires
-- log_*_member_added below. Without a guard, an approval would produce
-- both "your request was approved" AND "you were added" for the same
-- action. The guard is a transaction-local Postgres setting
-- (`clubchat.skip_add_notify`, set with is_local = true so it can never
-- leak into a later, unrelated transaction on a pooled connection):
-- decide_*_join_request sets it right before its membership insert, and
-- log_*_member_added checks it before inserting its own "added by"
-- notification.

create or replace function public.log_member_added()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
  new_member_name text;
  actor_id uuid := auth.uid();
  actor_name text;
  club_name text;
  body text;
begin
  select id into target_channel from public.channels where club_id = new.club_id and race_id is null and eboard_channel_id is null;
  if target_channel is null or actor_id is null then
    return new;
  end if;

  select full_name into new_member_name from public.profiles where id = new.user_id;

  if actor_id = new.user_id then
    body := coalesce(new_member_name, 'Someone') || ' joined the club';
  else
    select full_name into actor_name from public.profiles where id = actor_id;
    body := coalesce(new_member_name, 'Someone') || ' was added by ' || coalesce(actor_name, 'an admin');

    if current_setting('clubchat.skip_add_notify', true) is distinct from 'true' then
      select name into club_name from public.clubs where id = new.club_id;
      insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
      values (
        new.user_id, actor_id, new.club_id, 'member_added',
        'You were added to ' || coalesce(club_name, 'a club') || ' by ' || coalesce(actor_name, 'an admin'),
        '/clubs/' || new.club_id
      );
    end if;
  end if;

  insert into public.messages (channel_id, sender_id, message_type, body)
  values (target_channel, actor_id, 'system', body);

  return new;
end;
$$;

create or replace function public.log_member_removed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
  removed_name text;
  actor_id uuid := auth.uid();
  actor_name text;
  club_name text;
  body text;
begin
  select id into target_channel from public.channels where club_id = old.club_id and race_id is null and eboard_channel_id is null;
  if target_channel is null or actor_id is null then
    return old;
  end if;

  select full_name into removed_name from public.profiles where id = old.user_id;

  if actor_id = old.user_id then
    body := coalesce(removed_name, 'Someone') || ' left the club';
  else
    select full_name into actor_name from public.profiles where id = actor_id;
    body := coalesce(removed_name, 'Someone') || ' was removed by ' || coalesce(actor_name, 'an admin');

    select name into club_name from public.clubs where id = old.club_id;
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (
      old.user_id, actor_id, old.club_id, 'member_removed',
      'You were removed from ' || coalesce(club_name, 'a club') || ' by ' || coalesce(actor_name, 'an admin'),
      '/clubs'
    );
  end if;

  insert into public.messages (channel_id, sender_id, message_type, body)
  values (target_channel, actor_id, 'system', body);

  return old;
end;
$$;

create or replace function public.log_member_role_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
  member_name text;
  actor_id uuid := auth.uid();
  actor_name text;
  club_name text;
  body text;
  notif_body text;
begin
  if new.role = old.role then
    return new;
  end if;

  select id into target_channel from public.channels where club_id = new.club_id and race_id is null and eboard_channel_id is null;
  if target_channel is null or actor_id is null then
    return new;
  end if;

  select full_name into member_name from public.profiles where id = new.user_id;
  select full_name into actor_name from public.profiles where id = actor_id;
  select name into club_name from public.clubs where id = new.club_id;

  if new.role = 'admin' then
    body := coalesce(member_name, 'Someone') || ' was promoted to admin by ' || coalesce(actor_name, 'an admin');
    notif_body := 'You were promoted to admin in ' || coalesce(club_name, 'a club') || ' by ' || coalesce(actor_name, 'an admin');
  else
    body := coalesce(member_name, 'Someone') || ' was removed as admin by ' || coalesce(actor_name, 'an admin');
    notif_body := 'You were removed as admin in ' || coalesce(club_name, 'a club') || ' by ' || coalesce(actor_name, 'an admin');
  end if;

  insert into public.messages (channel_id, sender_id, message_type, body)
  values (target_channel, actor_id, 'system', body);

  if actor_id <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (new.user_id, actor_id, new.club_id, 'role_changed', notif_body, '/clubs/' || new.club_id);
  end if;

  return new;
end;
$$;

create or replace function public.log_race_member_added()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
  new_member_name text;
  actor_id uuid := auth.uid();
  actor_name text;
  race_row public.races;
  body text;
begin
  select id into target_channel from public.channels where race_id = new.race_id;
  if target_channel is null or actor_id is null then
    return new;
  end if;

  select full_name into new_member_name from public.profiles where id = new.user_id;

  if actor_id = new.user_id then
    body := coalesce(new_member_name, 'Someone') || ' joined';
  else
    select full_name into actor_name from public.profiles where id = actor_id;
    body := coalesce(new_member_name, 'Someone') || ' was added by ' || coalesce(actor_name, 'an admin');

    if current_setting('clubchat.skip_add_notify', true) is distinct from 'true' then
      select * into race_row from public.races where id = new.race_id;
      insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
      values (
        new.user_id, actor_id, race_row.club_id, 'member_added',
        'You were added to ' || coalesce(race_row.name, 'a race') || ' by ' || coalesce(actor_name, 'an admin'),
        '/clubs/' || race_row.club_id || '/race/' || new.race_id
      );
    end if;
  end if;

  insert into public.messages (channel_id, sender_id, message_type, body)
  values (target_channel, actor_id, 'system', body);

  return new;
end;
$$;

create or replace function public.log_eboard_member_added()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
  new_member_name text;
  actor_id uuid := auth.uid();
  actor_name text;
  eboard_club_id uuid;
  body text;
begin
  select id into target_channel from public.channels where eboard_channel_id = new.eboard_channel_id;
  if target_channel is null or actor_id is null then
    return new;
  end if;

  select full_name into new_member_name from public.profiles where id = new.user_id;

  if actor_id = new.user_id then
    body := coalesce(new_member_name, 'Someone') || ' joined';
  else
    select full_name into actor_name from public.profiles where id = actor_id;
    body := coalesce(new_member_name, 'Someone') || ' was added by ' || coalesce(actor_name, 'an admin');

    if current_setting('clubchat.skip_add_notify', true) is distinct from 'true' then
      select club_id into eboard_club_id from public.eboard_channels where id = new.eboard_channel_id;
      insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
      values (
        new.user_id, actor_id, eboard_club_id, 'member_added',
        'You were added to the Eboard by ' || coalesce(actor_name, 'an admin'),
        '/clubs/' || eboard_club_id || '/eboard'
      );
    end if;
  end if;

  insert into public.messages (channel_id, sender_id, message_type, body)
  values (target_channel, actor_id, 'system', body);

  return new;
end;
$$;

-- Explicit "your request was approved/denied by X" notification, plus
-- the skip-add-notify guard right before the approval branch's
-- membership insert (see file header).

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

  -- The pending "X wants to join" admin-inbox notification is no longer
  -- actionable once decided — remove every admin's copy of it. Scoped by
  -- target_path (which already encodes this exact club) + actor_id (the
  -- requester), since notifications has no direct request_id column to
  -- key on (see 0031's target_path design note).
  delete from public.notifications
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

  delete from public.notifications
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

  delete from public.notifications
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
