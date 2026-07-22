-- Bug found live while verifying 0056: the notification body's snippet was
-- taken straight from new.body, so a mention token leaked into the
-- human-facing notification text verbatim, e.g. "...Hey
-- @[Luke Belardo](09af0a86-...) can you check..." instead of "...Hey
-- @Luke Belardo can you check...". Fixed by stripping every mention token
-- down to its plain "@Name" form before truncating to the snippet — same
-- re-create-unchanged-except-one-line technique 0036/0038/0043/0048/0050/
-- 0054 already used for this class of fix.
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

  snippet := left(regexp_replace(new.body, '@\[([^\]]+)\]\([0-9a-fA-F-]{36}\)', '@\1', 'g'), 80);
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
