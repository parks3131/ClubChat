-- @mention notifications (task: mention_tagging). Mentions are embedded
-- directly in a message's body as `@[Full Name](userId)` tokens (see
-- lib/mentions.ts) rather than a separate join table — this trigger just
-- parses that same token shape back out of new.body on insert.
--
-- Mirrors notify_announcement's (0050) 3-way channel-scope branch exactly
-- (race_id / eboard_channel_id / else club_id), including routing every
-- mention to that scope's own chat target_path. The one addition over
-- that pattern: a mentioned user only gets notified if they can actually
-- see the channel the mention was posted in (checked against the same
-- membership table each branch's audience is drawn from) — same
-- reasoning as 0050 itself, which narrowed notify_announcement's audience
-- for exactly this "don't notify someone about a channel they can't
-- open" reason.
create or replace function public.notify_message_mentions()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  chan public.channels;
  race_row public.races;
  scope_name text;
  path text;
  snippet text;
  sender_name text;
  mention_id uuid;
  seen uuid[] := '{}';
  has_access boolean;
begin
  if new.body is null or new.message_type = 'system' then
    return new;
  end if;

  select * into chan from public.channels where id = new.channel_id;
  if chan.id is null then
    return new;
  end if;

  snippet := left(new.body, 80);
  select full_name into sender_name from public.profiles where id = new.sender_id;

  if chan.race_id is not null then
    select * into race_row from public.races where id = chan.race_id;
    scope_name := coalesce(race_row.name, 'a race');
    path := '/clubs/' || chan.club_id || '/race/' || chan.race_id || '/chat';
  elsif chan.eboard_channel_id is not null then
    scope_name := 'the Eboard';
    path := '/clubs/' || chan.club_id || '/eboard/chat';
  else
    select coalesce(name, 'your club') into scope_name from public.clubs where id = chan.club_id;
    path := '/clubs/' || chan.club_id || '/chat';
  end if;

  for mention_id in
    select distinct m[1]::uuid
    from regexp_matches(new.body, '@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)', 'g') as m
  loop
    if mention_id = new.sender_id or mention_id = any(seen) then
      continue;
    end if;
    seen := seen || mention_id;

    if chan.race_id is not null then
      has_access := exists(select 1 from public.race_members where race_id = chan.race_id and user_id = mention_id);
    elsif chan.eboard_channel_id is not null then
      has_access := exists(
        select 1 from public.eboard_channel_members
        where eboard_channel_id = chan.eboard_channel_id and user_id = mention_id
      );
    else
      has_access := exists(select 1 from public.club_members where club_id = chan.club_id and user_id = mention_id);
    end if;

    if not has_access then
      continue;
    end if;

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (
      mention_id, new.sender_id, chan.club_id, 'mentioned',
      coalesce(sender_name, 'Someone') || ' mentioned you in ' || scope_name || ': ' || snippet,
      path
    );
  end loop;

  return new;
end;
$$;

create trigger on_message_mentions
  after insert on public.messages
  for each row
  execute function public.notify_message_mentions();
