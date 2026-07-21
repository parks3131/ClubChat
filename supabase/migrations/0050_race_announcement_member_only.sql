-- Founder follow-up right after task #46: the same "requires a real
-- race_members row, no club-admin fallback" rule should apply anywhere
-- an operation lives inside a race's channel, not just polls.
-- notify_announcement's race branch was the one remaining place still
-- unioning in club Admins/Owners (confirmed via
-- `select proname from pg_proc where prosrc ilike '%race_members%' and
-- prosrc ilike '%union%'` — it was the only match left after 0049 fixed
-- notify_poll_created/notify_polls_closing_soon) — meaning a non-member
-- manager still got notified about a race chat announcement they
-- couldn't actually open, since chat access itself
-- (is_channel_member's race branch) has been race_members-only since
-- task #44/0044_race_channel_rework.sql already. This migration doesn't
-- change any access/RLS — chat access was already correct — only the
-- notification *audience*, to stop pointing people at a channel they
-- can't read.
--
-- Pulled the exact live source via `select prosrc from pg_proc where
-- proname = 'notify_announcement'` before writing this (see task #45's
-- HISTORY.md entry for why: a hand-reconstructed version differed from
-- the real function in five ways last time) — only the race branch's
-- audience subquery changes, nothing else in this function.

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
    select rm.user_id, new.sender_id, race_row.club_id, 'announcement'::notification_type,
      'New announcement in ' || scope_name || ': ' || snippet, path
    from public.race_members rm
    where rm.race_id = chan.race_id and rm.user_id <> new.sender_id;

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
