-- Eboard & Council: a private, admin-only mini-club nested inside the
-- parent club, from a founder wireframe (see SPEC.md task #17). Same
-- overall shape as races (0016_races.sql) — its own membership + its own
-- channel — but with three deliberate differences:
--   1. Exactly one per club (unique constraint on club_id), not a list.
--   2. Being a club admin only grants *visibility* (the hub row + being
--      allowed to request/be added) — unlike races, it does NOT grant
--      automatic membership/chat access. An admin still has to request
--      to join or be added by an existing member.
--   3. Because of (2), approve/direct-add rights belong to *existing
--      eboard_channel_members*, not to "any club admin" the way races'
--      is_race_admin (== is_club_admin) grants every admin approval
--      rights. Every member is still guaranteed to already be a club
--      admin — enforced in the insert policy below — so once inside,
--      everyone in the channel has full chat-admin rights (pin/announce),
--      no separate "eboard admin" role needed.

create table public.eboard_channels (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null unique references public.clubs (id) on delete cascade,
  name text not null,
  description text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.eboard_channel_members (
  eboard_channel_id uuid not null references public.eboard_channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (eboard_channel_id, user_id)
);

create table public.eboard_channel_join_requests (
  id uuid primary key default gen_random_uuid(),
  eboard_channel_id uuid not null references public.eboard_channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  unique (eboard_channel_id, user_id)
);

-- "Is the caller a club admin of this eboard channel's club" — gates
-- seeing the eboard_channels row exists at all, and filing a join
-- request. Deliberately does NOT imply membership (see note 2 above).
create function public.is_eboard_club_admin(p_eboard_channel_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_club_admin(club_id) from public.eboard_channels where id = p_eboard_channel_id;
$$;

create function public.is_eboard_member(p_eboard_channel_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.eboard_channel_members
    where eboard_channel_id = p_eboard_channel_id and user_id = auth.uid()
  );
$$;

-- Generic check used only to validate the *target* of a direct-add (the
-- caller-side check is always is_eboard_member, which already implies
-- club-admin status for the caller via the insert policy below).
create function public.is_user_club_admin(p_club_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = p_user_id and role = 'admin'
  );
$$;

alter table public.eboard_channels enable row level security;
alter table public.eboard_channel_members enable row level security;
alter table public.eboard_channel_join_requests enable row level security;

-- eboard_channels: only club admins ever see this row exists (this is
-- what makes the hub row itself invisible to regular members — there's
-- simply nothing to render). No chicken-and-egg SELECT-after-INSERT
-- issue (see SPEC.md section 6): is_club_admin(club_id) is already true
-- independent of anything this row's own trigger creates.
create policy "club admins can read their eboard channel"
  on public.eboard_channels for select
  to authenticated
  using (public.is_club_admin(club_id));

create policy "club admins can create the eboard channel"
  on public.eboard_channels for insert
  to authenticated
  with check (public.is_club_admin(club_id) and created_by = auth.uid());

-- eboard_channel_members: any club admin can see the roster (so they can
-- decide whether it's worth requesting), but only an existing member can
-- add someone new — and only if that someone is already a club admin,
-- since membership here must always be a subset of club admins.
create policy "club admins can read the eboard roster"
  on public.eboard_channel_members for select
  to authenticated
  using (public.is_eboard_club_admin(eboard_channel_id));

create policy "eboard members can add other club admins"
  on public.eboard_channel_members for insert
  to authenticated
  with check (
    public.is_eboard_member(eboard_channel_id)
    and public.is_user_club_admin(
      (select club_id from public.eboard_channels where id = eboard_channel_id),
      user_id
    )
  );

-- eboard_channel_join_requests: requester sees their own; existing
-- members see (and decide) the pending queue. A club admin who isn't yet
-- a member can't see other people's requests — they can only see and act
-- on their own, via the user_id = auth.uid() branch.
create policy "requester or eboard member can read join requests"
  on public.eboard_channel_join_requests for select
  to authenticated
  using (user_id = auth.uid() or public.is_eboard_member(eboard_channel_id));

create policy "club admins can create their own eboard join request"
  on public.eboard_channel_join_requests for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_eboard_club_admin(eboard_channel_id));

create policy "eboard members can decide join requests"
  on public.eboard_channel_join_requests for update
  to authenticated
  using (public.is_eboard_member(eboard_channel_id))
  with check (public.is_eboard_member(eboard_channel_id));

-- channels gains a nullable eboard_channel_id, same generalization
-- pattern 0016 used for race_id. Note: an eboard channel's row also has
-- race_id null, which collides with the existing "one main channel per
-- club" partial unique index (`where race_id is null`) — re-scope it to
-- exclude eboard channels too.
alter table public.channels add column eboard_channel_id uuid references public.eboard_channels (id) on delete cascade;
drop index public.channels_one_per_club;
create unique index channels_one_per_club on public.channels (club_id) where race_id is null and eboard_channel_id is null;
create unique index channels_one_per_eboard on public.channels (eboard_channel_id) where eboard_channel_id is not null;

create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case
    when c.race_id is not null then public.is_race_admin(c.race_id) or public.is_race_member(c.race_id)
    when c.eboard_channel_id is not null then public.is_eboard_member(c.eboard_channel_id)
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
    -- every eboard_channel_member is already a club admin (enforced by
    -- the insert policy above), so membership alone grants chat-admin
    -- rights here — no separate "eboard admin" role.
    when c.eboard_channel_id is not null then public.is_eboard_member(c.eboard_channel_id)
    else public.is_club_admin(c.club_id)
  end
  from public.channels c where c.id = p_channel_id;
$$;

-- 0016 already fixed this once when race channels made "one channel per
-- club" untrue; an eboard channel's row (race_id null, eboard_channel_id
-- not null) breaks the same lookup a second way, since it's still
-- `race_id is null`. Pin all three trigger functions to the true main
-- channel by also excluding eboard channels.
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
  select id into target_channel from public.channels where club_id = new.club_id and race_id is null and eboard_channel_id is null;
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
  select id into target_channel from public.channels where club_id = old.club_id and race_id is null and eboard_channel_id is null;
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

  select id into target_channel from public.channels where club_id = new.club_id and race_id is null and eboard_channel_id is null;
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

-- Whoever creates the eboard channel is automatically its first member
-- and gets a dedicated channel — same shape as handle_new_race in 0016.
create function public.handle_new_eboard_channel()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.eboard_channel_members (eboard_channel_id, user_id)
  values (new.id, new.created_by);

  insert into public.channels (club_id, eboard_channel_id)
  values (new.club_id, new.id);

  return new;
end;
$$;

create trigger on_eboard_channel_created
  after insert on public.eboard_channels
  for each row execute function public.handle_new_eboard_channel();

create function public.log_eboard_member_added()
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
  select id into target_channel from public.channels where eboard_channel_id = new.eboard_channel_id;
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

create trigger on_eboard_member_added
  after insert on public.eboard_channel_members
  for each row execute function public.log_eboard_member_added();

-- Join immediately if already a member (no-op path for the UI), else
-- file/refresh a pending request. Only a club admin may call this at
-- all — unlike request_join_race, there's no "is a club member" floor
-- since regular members can never join an eboard channel.
create function public.request_join_eboard_channel(target_eboard_channel_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_eboard_club_admin(target_eboard_channel_id) then
    raise exception 'Not authorized';
  end if;

  if public.is_eboard_member(target_eboard_channel_id) then
    return 'joined';
  end if;

  insert into public.eboard_channel_join_requests (eboard_channel_id, user_id, status)
  values (target_eboard_channel_id, auth.uid(), 'pending')
  on conflict (eboard_channel_id, user_id)
  do update set status = 'pending', created_at = now(), decided_at = null, decided_by = null
  where public.eboard_channel_join_requests.status <> 'pending';

  return 'requested';
end;
$$;

-- Decided by an existing eboard member, not by "any club admin" (see
-- note 3 at the top of this file) — approval also adds the
-- eboard_channel_members row, firing log_eboard_member_added above.
create function public.decide_eboard_join_request(request_id uuid, approve boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  req public.eboard_channel_join_requests;
begin
  select * into req from public.eboard_channel_join_requests where id = request_id;
  if req.id is null then
    raise exception 'Request not found';
  end if;
  if not public.is_eboard_member(req.eboard_channel_id) then
    raise exception 'Not authorized';
  end if;

  update public.eboard_channel_join_requests
  set status = case when approve then 'approved' else 'denied' end,
      decided_at = now(),
      decided_by = auth.uid()
  where id = request_id;

  if approve then
    insert into public.eboard_channel_members (eboard_channel_id, user_id)
    values (req.eboard_channel_id, req.user_id)
    on conflict (eboard_channel_id, user_id) do nothing;
  end if;
end;
$$;
