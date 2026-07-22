-- Replaces 0056/0057's notify_message_mentions (which parsed new.body on a
-- messages insert) now that mentions live in their own table (0058) instead
-- of embedded in the message body. Fires per mention row instead of per
-- message, reading the parent message for channel/scope context — same
-- audience/target_path logic as before (mirrors notify_announcement's
-- race/eboard/club branch shape), just keyed off message_mentions.mentioned_user_id
-- directly instead of a regex match.
drop trigger if exists on_message_mentions on public.messages;
drop function if exists public.notify_message_mentions();

create or replace function public.notify_message_mention_row()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  msg public.messages;
  chan public.channels;
  race_row public.races;
  scope_name text;
  path text;
  snippet text;
  sender_name text;
  has_access boolean;
begin
  select * into msg from public.messages where id = new.message_id;
  if msg.id is null or new.mentioned_user_id = msg.sender_id then
    return new;
  end if;

  select * into chan from public.channels where id = msg.channel_id;
  if chan.id is null then
    return new;
  end if;

  snippet := left(coalesce(msg.body, ''), 80);
  select full_name into sender_name from public.profiles where id = msg.sender_id;

  if chan.race_id is not null then
    select * into race_row from public.races where id = chan.race_id;
    scope_name := coalesce(race_row.name, 'a race');
    path := '/clubs/' || chan.club_id || '/race/' || chan.race_id || '/chat';
    has_access := exists(select 1 from public.race_members where race_id = chan.race_id and user_id = new.mentioned_user_id);
  elsif chan.eboard_channel_id is not null then
    scope_name := 'the Eboard';
    path := '/clubs/' || chan.club_id || '/eboard/chat';
    has_access := exists(
      select 1 from public.eboard_channel_members
      where eboard_channel_id = chan.eboard_channel_id and user_id = new.mentioned_user_id
    );
  else
    select coalesce(name, 'your club') into scope_name from public.clubs where id = chan.club_id;
    path := '/clubs/' || chan.club_id || '/chat';
    has_access := exists(select 1 from public.club_members where club_id = chan.club_id and user_id = new.mentioned_user_id);
  end if;

  if not has_access then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
  values (
    new.mentioned_user_id, msg.sender_id, chan.club_id, 'mentioned',
    coalesce(sender_name, 'Someone') || ' mentioned you in ' || scope_name || ': ' || snippet,
    path
  );

  return new;
end;
$$;

create trigger on_message_mention_added
  after insert on public.message_mentions
  for each row
  execute function public.notify_message_mention_row();
