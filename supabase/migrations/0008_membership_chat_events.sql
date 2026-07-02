-- Post a 'system' chat message whenever club_members gains or loses a
-- row, regardless of which path caused it (search-join, invite code,
-- admin direct add/remove, or an approved join request) — all of those
-- ultimately do a plain insert/delete on club_members, so hooking the
-- table instead of each call site keeps this consistent by construction.
--
-- auth.uid() inside a security-definer trigger still reflects the actual
-- authenticated caller (security definer only elevates the function's
-- own privileges, it doesn't change the session), so comparing it to
-- NEW.user_id / OLD.user_id distinguishes "did this to themselves" from
-- "an admin did this to someone else".

create function public.log_member_added()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
  new_member_name text;
  actor_id uuid := auth.uid();
  actor_name text;
  body text;
begin
  select id into target_channel from public.channels where club_id = new.club_id;
  if target_channel is null or actor_id is null then
    return new;
  end if;

  select full_name into new_member_name from public.profiles where id = new.user_id;

  if actor_id = new.user_id then
    body := coalesce(new_member_name, 'Someone') || ' joined the club';
  else
    select full_name into actor_name from public.profiles where id = actor_id;
    body := coalesce(new_member_name, 'Someone') || ' was added by ' || coalesce(actor_name, 'an admin');
  end if;

  insert into public.messages (channel_id, sender_id, message_type, body)
  values (target_channel, actor_id, 'system', body);

  return new;
end;
$$;

create trigger on_club_member_added
  after insert on public.club_members
  for each row execute function public.log_member_added();

create function public.log_member_removed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
  removed_name text;
  actor_id uuid := auth.uid();
  actor_name text;
  body text;
begin
  select id into target_channel from public.channels where club_id = old.club_id;
  if target_channel is null or actor_id is null then
    return old;
  end if;

  select full_name into removed_name from public.profiles where id = old.user_id;

  if actor_id = old.user_id then
    body := coalesce(removed_name, 'Someone') || ' left the club';
  else
    select full_name into actor_name from public.profiles where id = actor_id;
    body := coalesce(removed_name, 'Someone') || ' was removed by ' || coalesce(actor_name, 'an admin');
  end if;

  insert into public.messages (channel_id, sender_id, message_type, body)
  values (target_channel, actor_id, 'system', body);

  return old;
end;
$$;

create trigger on_club_member_removed
  after delete on public.club_members
  for each row execute function public.log_member_removed();
