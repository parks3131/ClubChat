-- New creation-fan-out notifications — polls, calendar events, races,
-- Eboard meetings, and announcement messages. Every one of these is a
-- plain client `.insert()` (no RPC layer — confirmed by reading
-- lib/polls.ts/lib/calendar.ts/lib/races.ts/lib/eboard.ts before writing
-- this), so an `after insert` trigger is the only place to hook the
-- fan-out, same as `handle_new_race`/`handle_new_eboard_channel` already
-- do for their own side effects off the same kind of plain insert.
--
-- The announcement trigger deliberately only fires on `message_type =
-- 'announcement'` at INSERT time — pinning an existing message is a
-- separate `update` of the `pinned` boolean and never touches this
-- trigger at all, so "announcements notify, pins don't" falls out of the
-- schema shape with no extra logic needed.

create or replace function public.notify_poll_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  club_name text;
begin
  select name into club_name from public.clubs where id = new.club_id;

  insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
  select
    cm.user_id, new.created_by, new.club_id, 'poll_created',
    'New poll in ' || coalesce(club_name, 'your club') || ': ' || new.question,
    '/clubs/' || new.club_id || '/polls/' || new.id
  from public.club_members cm
  where cm.club_id = new.club_id and cm.user_id <> new.created_by;

  return new;
end;
$$;

create trigger on_poll_created
  after insert on public.polls
  for each row execute function public.notify_poll_created();

create or replace function public.notify_event_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  club_name text;
begin
  select name into club_name from public.clubs where id = new.club_id;

  insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
  select
    cm.user_id, new.created_by, new.club_id, 'event_created',
    'New event in ' || coalesce(club_name, 'your club') || ': ' || new.title,
    '/clubs/' || new.club_id || '/event/' || new.id
  from public.club_members cm
  where cm.club_id = new.club_id and cm.user_id <> new.created_by;

  return new;
end;
$$;

create trigger on_calendar_event_created
  after insert on public.calendar_events
  for each row execute function public.notify_event_created();

-- Separate from the existing on_race_created/handle_new_race trigger,
-- which stays focused on its own job (auto-add the creator, create the
-- channel) — this one only handles the notification fan-out.
create or replace function public.notify_race_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  club_name text;
begin
  select name into club_name from public.clubs where id = new.club_id;

  insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
  select
    cm.user_id, new.created_by, new.club_id, 'race_created',
    'New race in ' || coalesce(club_name, 'your club') || ': ' || new.name,
    '/clubs/' || new.club_id || '/race/' || new.id
  from public.club_members cm
  where cm.club_id = new.club_id and cm.user_id <> new.created_by;

  return new;
end;
$$;

create trigger on_race_created_notify
  after insert on public.races
  for each row execute function public.notify_race_created();

create or replace function public.notify_meeting_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  eboard_club_id uuid;
  club_name text;
begin
  select club_id into eboard_club_id from public.eboard_channels where id = new.eboard_channel_id;
  select name into club_name from public.clubs where id = eboard_club_id;

  insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
  select
    ecm.user_id, new.created_by, eboard_club_id, 'meeting_created',
    'New meeting in ' || coalesce(club_name, 'your club') || ' Eboard: ' || new.title,
    '/clubs/' || eboard_club_id || '/eboard/meeting/' || new.id
  from public.eboard_channel_members ecm
  where ecm.eboard_channel_id = new.eboard_channel_id and ecm.user_id <> new.created_by;

  return new;
end;
$$;

create trigger on_eboard_meeting_created
  after insert on public.eboard_meetings
  for each row execute function public.notify_meeting_created();

-- Resolves the posting channel's scope (club/race/Eboard, same three-way
-- branch shape as is_channel_member) and fans out to that scope's full
-- audience, excluding the sender. Race audience is race roster UNION
-- club admins, matching is_channel_member's own "is_race_admin(...) or
-- is_race_member(...)" access rule for race channels.
create or replace function public.notify_announcement()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  chan public.channels;
  club_name text;
  race_row public.races;
  scope_name text;
  path text;
  snippet text;
begin
  select * into chan from public.channels where id = new.channel_id;
  if chan.id is null then
    return new;
  end if;

  snippet := left(coalesce(new.body, ''), 80);

  if chan.race_id is not null then
    select * into race_row from public.races where id = chan.race_id;
    scope_name := coalesce(race_row.name, 'a race');
    path := '/clubs/' || race_row.club_id || '/race/' || chan.race_id || '/chat';

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select distinct u.user_id, new.sender_id, race_row.club_id, 'announcement',
      'New announcement in ' || scope_name || ': ' || snippet, path
    from (
      select user_id from public.race_members where race_id = chan.race_id
      union
      select user_id from public.club_members where club_id = race_row.club_id and role = 'admin'
    ) u
    where u.user_id <> new.sender_id;

  elsif chan.eboard_channel_id is not null then
    path := '/clubs/' || (select club_id from public.eboard_channels where id = chan.eboard_channel_id) || '/eboard/chat';

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select ecm.user_id, new.sender_id,
      (select club_id from public.eboard_channels where id = chan.eboard_channel_id),
      'announcement', 'New announcement in the Eboard: ' || snippet, path
    from public.eboard_channel_members ecm
    where ecm.eboard_channel_id = chan.eboard_channel_id and ecm.user_id <> new.sender_id;

  else
    select name into club_name from public.clubs where id = chan.club_id;
    path := '/clubs/' || chan.club_id || '/chat';

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select cm.user_id, new.sender_id, chan.club_id, 'announcement',
      'New announcement in ' || coalesce(club_name, 'your club') || ': ' || snippet, path
    from public.club_members cm
    where cm.club_id = chan.club_id and cm.user_id <> new.sender_id;
  end if;

  return new;
end;
$$;

create trigger on_announcement_posted
  after insert on public.messages
  for each row when (new.message_type = 'announcement')
  execute function public.notify_announcement();
