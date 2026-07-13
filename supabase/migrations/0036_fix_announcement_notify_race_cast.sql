-- Fixes a real bug found live: posting an announcement in a race channel
-- always failed with a 400 (the whole message insert rolled back, since
-- triggers run in the same transaction as the statement that fired them),
-- while the identical action worked fine in club chat and Eboard chat.
--
-- Root cause: notify_announcement()'s race branch (0034) is the only one
-- of the three scope branches that wraps its recipient list in
-- `select distinct ... from (... union ...) u`. Postgres resolves an
-- untyped string literal like 'announcement' against the INSERT target
-- column's type (notification_type) *only* while it stays "unknown"-typed
-- — but SELECT DISTINCT needs a concrete, comparable type for every
-- selected expression to sort/dedupe by, so it forces 'announcement' to
-- default to `text` right there. Once it's concretely `text`, the elided
-- "unknown -> notification_type" implicit cast Postgres normally performs
-- for INSERT...SELECT no longer applies, and Postgres refuses to
-- implicitly cast a genuine text value to a user-defined enum:
--   column "type" is of type notification_type but expression is of type text
-- Confirmed in isolation against this exact Postgres instance:
--   insert into t select distinct x from (select 'a' as x union select 'b') u;
--   -> ERROR: column "type" is of type notification_type but expression is of type text
-- The club and Eboard branches have no DISTINCT/UNION in their SELECT, so
-- the literal stays "unknown"-typed and casts implicitly — which is why
-- only race-channel announcements were ever affected.
--
-- Fix: cast the literal explicitly wherever it's produced, so this
-- doesn't depend on how the surrounding query happens to be shaped.
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
      select user_id from public.club_members where club_id = race_row.club_id and role = 'admin'
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
