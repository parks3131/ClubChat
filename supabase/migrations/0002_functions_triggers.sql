-- Auto-create a profile row whenever someone signs up via Supabase Auth.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Whoever creates a club is automatically its admin and gets a general channel.
create function public.handle_new_club()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.club_members (club_id, user_id, role)
  values (new.id, new.created_by, 'admin');

  insert into public.channels (club_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_club_created
  after insert on public.clubs
  for each row execute function public.handle_new_club();

-- Lets a member join a club by invite code without exposing the clubs
-- table to non-members via RLS (runs as owner, bypassing row security).
create function public.join_club_by_code(code text)
returns public.clubs
language plpgsql
security definer set search_path = public
as $$
declare
  target_club public.clubs;
begin
  select * into target_club from public.clubs where invite_code = code;

  if target_club.id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.club_members (club_id, user_id, role)
  values (target_club.id, auth.uid(), 'member')
  on conflict (club_id, user_id) do nothing;

  return target_club;
end;
$$;
