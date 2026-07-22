-- A created Eboard meeting auto-posts into its own chat, same shape as
-- the existing poll/event chat-card triggers (0071_poll_event_chat_messages
-- .sql). Also generalizes post_poll_chat_message(): race/Eboard-scoped
-- polls were previously skipped entirely (club-scoped only, "for now" per
-- 0071's own comment) — they now post into their own race/Eboard channel
-- instead of the club's main one, closing that carve-out now that race/
-- Eboard chat get their own "+" poll-creation shortcut.
alter table public.messages add column meeting_id uuid references public.eboard_meetings (id) on delete cascade;

create or replace function public.post_poll_chat_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
begin
  if new.race_id is not null then
    select id into target_channel from public.channels where race_id = new.race_id;
  elsif new.eboard_channel_id is not null then
    select id into target_channel from public.channels where eboard_channel_id = new.eboard_channel_id;
  else
    select id into target_channel from public.channels
      where club_id = new.club_id and race_id is null and eboard_channel_id is null;
  end if;

  if target_channel is not null then
    insert into public.messages (channel_id, sender_id, message_type, poll_id)
    values (target_channel, new.created_by, 'poll', new.id);
  end if;

  return new;
end;
$$;

create or replace function public.post_meeting_chat_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
begin
  select id into target_channel from public.channels where eboard_channel_id = new.eboard_channel_id;

  if target_channel is not null then
    insert into public.messages (channel_id, sender_id, message_type, meeting_id)
    values (target_channel, new.created_by, 'meeting', new.id);
  end if;

  return new;
end;
$$;

create trigger on_eboard_meeting_created_post_chat
  after insert on public.eboard_meetings
  for each row execute function public.post_meeting_chat_message();
