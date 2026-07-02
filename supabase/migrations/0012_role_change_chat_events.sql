-- Same idea as 0008_membership_chat_events.sql (join/leave/add/remove)
-- but for role changes (currently only member -> admin is reachable from
-- the UI, but this handles either direction so a future demote action
-- doesn't need its own trigger).
create function public.log_member_role_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
  member_name text;
  actor_id uuid := auth.uid();
  actor_name text;
  body text;
begin
  if new.role = old.role then
    return new;
  end if;

  select id into target_channel from public.channels where club_id = new.club_id;
  if target_channel is null or actor_id is null then
    return new;
  end if;

  select full_name into member_name from public.profiles where id = new.user_id;
  select full_name into actor_name from public.profiles where id = actor_id;

  if new.role = 'admin' then
    body := coalesce(member_name, 'Someone') || ' was promoted to admin by ' || coalesce(actor_name, 'an admin');
  else
    body := coalesce(member_name, 'Someone') || ' was removed as admin by ' || coalesce(actor_name, 'an admin');
  end if;

  insert into public.messages (channel_id, sender_id, message_type, body)
  values (target_channel, actor_id, 'system', body);

  return new;
end;
$$;

create trigger on_club_member_role_changed
  after update of role on public.club_members
  for each row execute function public.log_member_role_changed();
