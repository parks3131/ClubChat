-- Club discovery: search-by-name join, gated by a per-club join policy
-- instead of an "invite only" tier. Every club still has its existing
-- invite_code/join_club_by_code path (unchanged, always-instant-join,
-- future share-link candidate) — join_policy only governs what happens
-- when someone finds the club via search instead of a code.

create type public.club_join_policy as enum ('open', 'request');

alter table public.clubs
  add column join_policy public.club_join_policy not null default 'request';

create table public.club_join_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  unique (club_id, user_id)
);

alter table public.club_join_requests enable row level security;

-- Requester can see their own request status; admins can see every
-- request for clubs they administer (this is the "visible to admin" list).
create policy "requester or admin can read join requests"
  on public.club_join_requests for select
  to authenticated
  using (user_id = auth.uid() or public.is_club_admin(club_id));

-- Direct inserts aren't used by the app (join_or_request_club below does
-- the insert as security definer so it can also branch on join_policy),
-- but a policy still needs to exist since the table has RLS enabled.
create policy "users can create their own join request"
  on public.club_join_requests for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "admins can decide join requests"
  on public.club_join_requests for update
  to authenticated
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

-- Search clubs by name for the "find a club" join flow. Bypasses the
-- clubs SELECT policy (non-members can't otherwise see a club row) but
-- only returns the safe subset needed to decide whether to join, and
-- excludes clubs the caller already belongs to.
create or replace function public.search_clubs(query text)
returns table (
  id uuid,
  name text,
  description text,
  sport text,
  join_policy public.club_join_policy,
  member_count bigint,
  request_status text
)
language sql
security definer set search_path = public
stable
as $$
  select
    c.id,
    c.name,
    c.description,
    c.sport,
    c.join_policy,
    (select count(*) from public.club_members cm where cm.club_id = c.id),
    (select r.status from public.club_join_requests r where r.club_id = c.id and r.user_id = auth.uid())
  from public.clubs c
  where c.name ilike '%' || query || '%'
    and not exists (
      select 1 from public.club_members cm where cm.club_id = c.id and cm.user_id = auth.uid()
    )
  order by c.name
  limit 10;
$$;

-- Join immediately if the club is open, otherwise file/refresh a pending
-- join request. Returns 'joined' or 'requested' so the UI knows which
-- state to show.
create or replace function public.join_or_request_club(target_club_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  policy public.club_join_policy;
begin
  select join_policy into policy from public.clubs where id = target_club_id;
  if policy is null then
    raise exception 'Club not found';
  end if;

  if policy = 'open' then
    insert into public.club_members (club_id, user_id, role)
    values (target_club_id, auth.uid(), 'member')
    on conflict (club_id, user_id) do nothing;
    return 'joined';
  end if;

  insert into public.club_join_requests (club_id, user_id, status)
  values (target_club_id, auth.uid(), 'pending')
  on conflict (club_id, user_id)
  do update set status = 'pending', created_at = now(), decided_at = null, decided_by = null
  where public.club_join_requests.status <> 'pending';

  return 'requested';
end;
$$;

-- Admin approves/denies a pending request; approval also adds the
-- membership row. Re-checks admin status explicitly since this runs as
-- security definer (bypassing the club_members insert policy on purpose).
create or replace function public.decide_join_request(request_id uuid, approve boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  req public.club_join_requests;
begin
  select * into req from public.club_join_requests where id = request_id;
  if req.id is null then
    raise exception 'Request not found';
  end if;
  if not public.is_club_admin(req.club_id) then
    raise exception 'Not authorized';
  end if;

  update public.club_join_requests
  set status = case when approve then 'approved' else 'denied' end,
      decided_at = now(),
      decided_by = auth.uid()
  where id = request_id;

  if approve then
    insert into public.club_members (club_id, user_id, role)
    values (req.club_id, req.user_id, 'member')
    on conflict (club_id, user_id) do nothing;
  end if;
end;
$$;
