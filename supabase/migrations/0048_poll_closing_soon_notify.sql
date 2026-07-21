-- Founder request: everyone who can access a poll gets a notification
-- once it's within 10 minutes of its own closes_at deadline. Every other
-- notification in this app is trigger-driven off a real INSERT/UPDATE
-- (see 0038's is_poll_closed comment: "no cron/background job, matching
-- how this app avoids scheduled jobs everywhere else") — but "N minutes
-- before a deadline nobody is touching" has no row-level event to hang a
-- trigger on. This is the first scheduled job in the app. pg_cron is
-- confirmed already compiled into shared_preload_libraries on this
-- Supabase Postgres image (`show shared_preload_libraries` includes
-- pg_cron) and cron.database_name already targets this database — just
-- needs `create extension`.

create extension if not exists pg_cron;

-- Dedup guard: without this, every cron tick inside the 10-minute window
-- would re-notify the same poll again. Set once notify_polls_closing_soon
-- actually processes a poll, regardless of whether its audience turned
-- out to be empty — a poll should only ever be considered for this once.
alter table public.polls add column closing_soon_notified_at timestamptz;

-- Mirrors notify_poll_created's (0038) three-way scope branch exactly —
-- it's the only existing function that already solves "who can see this
-- specific poll" per scope, and copying its shape keeps the audience
-- rules for "sees this poll at all" consistent everywhere they're
-- computed. Not a trigger — called on a timer by pg_cron below, so it
-- loops over every currently-eligible poll itself rather than reacting
-- to one row.
create or replace function public.notify_polls_closing_soon()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  poll_row public.polls;
  club_name text;
  race_row public.races;
  scope_name text;
begin
  for poll_row in
    select * from public.polls
    where closes_at is not null
      and not is_closed
      and closing_soon_notified_at is null
      and closes_at > now()
      and closes_at <= now() + interval '10 minutes'
  loop
    if poll_row.race_id is not null then
      select * into race_row from public.races where id = poll_row.race_id;
      scope_name := coalesce(race_row.name, 'a race');

      insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
      select distinct u.user_id, poll_row.created_by, poll_row.club_id, 'poll_closing_soon'::notification_type,
        'Poll closing soon in ' || scope_name || ': ' || poll_row.question,
        '/clubs/' || poll_row.club_id || '/race/' || poll_row.race_id || '/polls/' || poll_row.id
      from (
        select user_id from public.race_members where race_id = poll_row.race_id
        union
        select user_id from public.club_members where club_id = race_row.club_id and role in ('admin', 'owner')
      ) u;

    elsif poll_row.eboard_channel_id is not null then
      insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
      select ecm.user_id, poll_row.created_by, poll_row.club_id, 'poll_closing_soon'::notification_type,
        'Poll closing soon in the Eboard: ' || poll_row.question,
        '/clubs/' || poll_row.club_id || '/eboard/polls/' || poll_row.id
      from public.eboard_channel_members ecm
      where ecm.eboard_channel_id = poll_row.eboard_channel_id;

    else
      select name into club_name from public.clubs where id = poll_row.club_id;

      insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
      select cm.user_id, poll_row.created_by, poll_row.club_id, 'poll_closing_soon'::notification_type,
        'Poll closing soon in ' || coalesce(club_name, 'your club') || ': ' || poll_row.question,
        '/clubs/' || poll_row.club_id || '/polls/' || poll_row.id
      from public.club_members cm
      where cm.club_id = poll_row.club_id;
    end if;

    update public.polls set closing_soon_notified_at = now() where id = poll_row.id;
  end loop;
end;
$$;

-- Named schedule: cron.schedule(job_name, ...) upserts by name (pg_cron
-- 1.3+), so this is safe to re-run on every `supabase db reset` without
-- accumulating duplicate jobs. Every 1 minute so a 10-minute window is
-- always caught promptly, not so frequent it's wasteful for this app's
-- scale.
select cron.schedule(
  'poll-closing-soon-check',
  '* * * * *',
  $$ select public.notify_polls_closing_soon(); $$
);

-- Two sibling instances of the exact bug fixed twice already in
-- 0046_fix_club_join_request_target_path.sql (task #44), found while
-- writing this function's own race-branch audience query and checking
-- for other places doing the same computation: task #42
-- (0043_club_role_owner.sql) introduced the 3-tier Owner/Admin/Member
-- role system and re-patched several functions filtering
-- `role = 'admin'`, but these two race-branch audience queries were
-- missed — a club with a lone Owner and no separate Admins has never
-- received a race announcement notification or a race poll_created
-- notification for a poll they didn't create themselves, ever since
-- 0043 shipped. Deliberately not expanding into a full repo-wide audit
-- beyond these two matches (see docs/HISTORY.md task #45) — 0032's
-- `if new.role = 'admin'` is a role-transition check, not an audience
-- computation, and is left alone.

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
    select distinct u.user_id, new.sender_id, race_row.club_id, 'announcement'::notification_type,
      'New announcement in ' || scope_name || ': ' || snippet, path
    from (
      select user_id from public.race_members where race_id = chan.race_id
      union
      select user_id from public.club_members where club_id = race_row.club_id and role in ('admin', 'owner')
    ) u
    where u.user_id <> new.sender_id;

  elsif chan.eboard_channel_id is not null then
    path := '/clubs/' || (select club_id from public.eboard_channels where id = chan.eboard_channel_id) || '/eboard/chat';

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select ecm.user_id, new.sender_id,
      (select club_id from public.eboard_channels where id = chan.eboard_channel_id),
      'announcement'::notification_type, 'New announcement in the Eboard: ' || snippet, path
    from public.eboard_channel_members ecm
    where ecm.eboard_channel_id = chan.eboard_channel_id and ecm.user_id <> new.sender_id;

  else
    select name into club_name from public.clubs where id = chan.club_id;
    path := '/clubs/' || chan.club_id || '/chat';

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select cm.user_id, new.sender_id, chan.club_id, 'announcement'::notification_type,
      'New announcement in ' || coalesce(club_name, 'your club') || ': ' || snippet, path
    from public.club_members cm
    where cm.club_id = chan.club_id and cm.user_id <> new.sender_id;
  end if;

  return new;
end;
$$;

create or replace function public.notify_poll_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  club_name text;
  race_row public.races;
  scope_name text;
begin
  select name into club_name from public.clubs where id = new.club_id;

  if new.race_id is not null then
    select * into race_row from public.races where id = new.race_id;
    scope_name := coalesce(race_row.name, 'a race');

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select distinct u.user_id, new.created_by, new.club_id, 'poll_created'::notification_type,
      'New poll in ' || scope_name || ': ' || new.question,
      '/clubs/' || new.club_id || '/race/' || new.race_id || '/polls/' || new.id
    from (
      select user_id from public.race_members where race_id = new.race_id
      union
      select user_id from public.club_members where club_id = new.club_id and role in ('admin', 'owner')
    ) u
    where u.user_id <> new.created_by;

  elsif new.eboard_channel_id is not null then
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select ecm.user_id, new.created_by, new.club_id, 'poll_created'::notification_type,
      'New poll in the Eboard: ' || new.question,
      '/clubs/' || new.club_id || '/eboard/polls/' || new.id
    from public.eboard_channel_members ecm
    where ecm.eboard_channel_id = new.eboard_channel_id and ecm.user_id <> new.created_by;

  else
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select
      cm.user_id, new.created_by, new.club_id, 'poll_created'::notification_type,
      'New poll in ' || coalesce(club_name, 'your club') || ': ' || new.question,
      '/clubs/' || new.club_id || '/polls/' || new.id
    from public.club_members cm
    where cm.club_id = new.club_id and cm.user_id <> new.created_by;
  end if;

  return new;
end;
$$;
