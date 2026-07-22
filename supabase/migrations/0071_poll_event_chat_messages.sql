-- Auto-posts a votable poll card / linkable event card into club chat
-- the moment a poll or event is created — regardless of entry point
-- (dedicated Polls/Calendar screen, or the chat "+" shortcut), per
-- explicit founder call. Separate concern from notify_poll_created/
-- notify_event_created (0034), which still handle the Notifications-tab
-- bell entry unchanged; this only adds the chat-message mirror, mirroring
-- log_member_added's shape (0008) of a security-definer trigger inserting
-- straight into `messages`.
--
-- Club-scoped only for now: a race/Eboard poll doesn't post to its own
-- chat yet (same "for now" carve-out as the "+" attach menu / header
-- grid — founder said to extend there later). calendar_events has no
-- race/Eboard scope to begin with, so no branch is needed there.
create or replace function public.post_poll_chat_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
begin
  if new.race_id is not null or new.eboard_channel_id is not null then
    return new;
  end if;

  select id into target_channel from public.channels
    where club_id = new.club_id and race_id is null and eboard_channel_id is null;

  if target_channel is not null then
    insert into public.messages (channel_id, sender_id, message_type, poll_id)
    values (target_channel, new.created_by, 'poll', new.id);
  end if;

  return new;
end;
$$;

create trigger on_poll_created_post_chat
  after insert on public.polls
  for each row execute function public.post_poll_chat_message();

create or replace function public.post_event_chat_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
begin
  select id into target_channel from public.channels
    where club_id = new.club_id and race_id is null and eboard_channel_id is null;

  if target_channel is not null then
    insert into public.messages (channel_id, sender_id, message_type, event_id)
    values (target_channel, new.created_by, 'event', new.id);
  end if;

  return new;
end;
$$;

create trigger on_calendar_event_created_post_chat
  after insert on public.calendar_events
  for each row execute function public.post_event_chat_message();
