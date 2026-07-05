-- Race/Meet sub-spaces: a "mini-club nested inside the parent club" per
-- SPEC.md's domain model. A race is standalone (created directly from a
-- "Races & Meets" section on the club hub, not spawned from a calendar
-- event as SPEC.md originally sketched) — see SPEC.md section 1 for the
-- deviation note. Access is always request-based (no "open" policy like
-- clubs have): a club member requests, and any club admin can approve or
-- add them directly. There is no separate "race admin" role — being a
-- club admin already grants full read/write on every race under that
-- club, so permission checks reuse is_club_admin(club_id) throughout.

create table public.races (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  event_date date not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Race membership: only regular (approved) members get a row here.
-- Admins don't need one — they already have access via is_club_admin.
create table public.race_members (
  race_id uuid not null references public.races (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (race_id, user_id)
);

-- Same shape as club_join_requests (0006), scoped to a race instead of a
-- club. Always request-based, so there's no join_policy branch here.
create table public.race_join_requests (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  unique (race_id, user_id)
);

-- Helper functions (security-definer, same reasoning as is_club_member /
-- is_club_admin in 0003_rls.sql: avoids RLS self-recursion).

create function public.is_race_admin(p_race_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_club_admin(club_id) from public.races where id = p_race_id;
$$;

create function public.is_race_member(p_race_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.race_members
    where race_id = p_race_id and user_id = auth.uid()
  );
$$;

-- "Is the caller a member of the club this race belongs to" — used to
-- gate filing a join request (only club members can request to join one
-- of the club's races at all).
create function public.is_race_club_member(p_race_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_club_member(club_id) from public.races where id = p_race_id;
$$;

alter table public.races enable row level security;
alter table public.race_members enable row level security;
alter table public.race_join_requests enable row level security;

-- races: visible to every club member (so the "Races & Meets" list can
-- show names/dates to decide whether to request), writable by club
-- admins only. No INSERT ... RETURNING chicken-and-egg here (unlike
-- clubs in 0003) since is_club_member(club_id) is already true
-- independent of anything this row's own trigger creates.
create policy "club members can read races"
  on public.races for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "admins can create races"
  on public.races for insert
  to authenticated
  with check (public.is_club_admin(club_id));

create policy "admins can update races"
  on public.races for update
  to authenticated
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

create policy "admins can delete races"
  on public.races for delete
  to authenticated
  using (public.is_club_admin(club_id));

-- race_members: admins see every row for races they administer; a member
-- can see the roster once they're in it (mirrors club_members' "members
-- can see their club roster" policy, scoped to the race instead).
create policy "admins or race members can read the roster"
  on public.race_members for select
  to authenticated
  using (public.is_race_admin(race_id) or public.is_race_member(race_id));

-- Direct inserts happen from two places: the admin-add-member flow
-- (plain client insert) and decide_race_join_request's approval path
-- (security definer, bypasses this policy same as decide_join_request
-- does for club_members).
create policy "admins can add race members"
  on public.race_members for insert
  to authenticated
  with check (public.is_race_admin(race_id));

-- race_join_requests: requester sees their own request; any admin of the
-- race's club sees every request for it (the "pending requests" queue).
create policy "requester or admin can read race join requests"
  on public.race_join_requests for select
  to authenticated
  using (user_id = auth.uid() or public.is_race_admin(race_id));

-- Direct inserts aren't used by the app (request_join_race below does it
-- as security definer), but a policy still needs to exist since RLS is
-- enabled on this table.
create policy "club members can create their own race join request"
  on public.race_join_requests for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_race_club_member(race_id));

create policy "admins can decide race join requests"
  on public.race_join_requests for update
  to authenticated
  using (public.is_race_admin(race_id))
  with check (public.is_race_admin(race_id));

-- channels gains a nullable race_id, exactly as SPEC.md's domain model
-- anticipated, so race chat reuses messages/message_reactions (and all
-- their RLS) with zero new tables. A club still gets exactly one main
-- channel (race_id is null); a race can have exactly one channel of its
-- own.
alter table public.channels add column race_id uuid references public.races (id) on delete cascade;
alter table public.channels drop constraint channels_club_id_key;
create unique index channels_one_per_club on public.channels (club_id) where race_id is null;
create unique index channels_one_per_race on public.channels (race_id) where race_id is not null;

-- Generalize the two functions every messages/message_reactions/channels
-- policy is built on, so race-scoped channels are handled without
-- touching those policies at all: access is is_race_admin/is_race_member
-- when the channel belongs to a race, is_club_member/is_club_admin
-- otherwise.
create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case
    when c.race_id is not null then public.is_race_admin(c.race_id) or public.is_race_member(c.race_id)
    else public.is_club_member(c.club_id)
  end
  from public.channels c where c.id = p_channel_id;
$$;

create or replace function public.is_channel_admin(p_channel_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case
    when c.race_id is not null then public.is_race_admin(c.race_id)
    else public.is_club_admin(c.club_id)
  end
  from public.channels c where c.id = p_channel_id;
$$;

-- The channels SELECT policy (0003_rls.sql) checked is_club_member(club_id)
-- directly, which would let any club member read a race channel's row
-- (not its messages, those already went through is_channel_member, just
-- the channel row itself) even without race access. Route it through
-- is_channel_member too, now that the function is race-aware.
drop policy "members can read their club channel" on public.channels;
create policy "members can read accessible channels"
  on public.channels for select
  to authenticated
  using (public.is_channel_member(id));

-- 0008/0012's triggers looked up a club's channel with
-- `where club_id = new.club_id`, which was safe only because every club
-- had exactly one channel row. Now that a club can have many (one main +
-- one per race), that lookup must be pinned to the main channel
-- specifically, or it'll error with "more than one row returned by a
-- subquery" the first time a race channel exists. Re-create the same
-- three trigger functions (owned by the same triggers already attached
-- in 0008/0012, so no trigger changes needed) with that one line fixed.
create or replace function public.log_member_added()
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
  select id into target_channel from public.channels where club_id = new.club_id and race_id is null;
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

create or replace function public.log_member_removed()
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
  select id into target_channel from public.channels where club_id = old.club_id and race_id is null;
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

create or replace function public.log_member_role_changed()
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

  select id into target_channel from public.channels where club_id = new.club_id and race_id is null;
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

-- Whoever creates a race is automatically a member of it and gets a
-- dedicated channel — same shape as handle_new_club in 0002.
create function public.handle_new_race()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.race_members (race_id, user_id)
  values (new.id, new.created_by);

  insert into public.channels (club_id, race_id)
  values (new.club_id, new.id);

  return new;
end;
$$;

create trigger on_race_created
  after insert on public.races
  for each row execute function public.handle_new_race();

-- Same idea as 0008's join/leave system messages, scoped to a race's own
-- channel instead of the club's main one.
create function public.log_race_member_added()
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
  select id into target_channel from public.channels where race_id = new.race_id;
  if target_channel is null or actor_id is null then
    return new;
  end if;

  select full_name into new_member_name from public.profiles where id = new.user_id;

  if actor_id = new.user_id then
    body := coalesce(new_member_name, 'Someone') || ' joined';
  else
    select full_name into actor_name from public.profiles where id = actor_id;
    body := coalesce(new_member_name, 'Someone') || ' was added by ' || coalesce(actor_name, 'an admin');
  end if;

  insert into public.messages (channel_id, sender_id, message_type, body)
  values (target_channel, actor_id, 'system', body);

  return new;
end;
$$;

create trigger on_race_member_added
  after insert on public.race_members
  for each row execute function public.log_race_member_added();

-- Join immediately if the caller is already an admin/member (no-op path
-- for the UI to fall through cleanly), otherwise file/refresh a pending
-- request. Always request-based — no 'open' branch like
-- join_or_request_club, per an explicit founder call that races are
-- request-only.
create function public.request_join_race(target_race_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_race_club_member(target_race_id) then
    raise exception 'Not a member of this club';
  end if;

  if public.is_race_admin(target_race_id) or public.is_race_member(target_race_id) then
    return 'joined';
  end if;

  insert into public.race_join_requests (race_id, user_id, status)
  values (target_race_id, auth.uid(), 'pending')
  on conflict (race_id, user_id)
  do update set status = 'pending', created_at = now(), decided_at = null, decided_by = null
  where public.race_join_requests.status <> 'pending';

  return 'requested';
end;
$$;

-- Admin approves/denies a pending race request; approval also adds the
-- race_members row (which in turn fires log_race_member_added above).
create function public.decide_race_join_request(request_id uuid, approve boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  req public.race_join_requests;
begin
  select * into req from public.race_join_requests where id = request_id;
  if req.id is null then
    raise exception 'Request not found';
  end if;
  if not public.is_race_admin(req.race_id) then
    raise exception 'Not authorized';
  end if;

  update public.race_join_requests
  set status = case when approve then 'approved' else 'denied' end,
      decided_at = now(),
      decided_by = auth.uid()
  where id = request_id;

  if approve then
    insert into public.race_members (race_id, user_id)
    values (req.race_id, req.user_id)
    on conflict (race_id, user_id) do nothing;
  end if;
end;
$$;
