-- Car Assignments & Groups, one of the 4 placeholder race sections from
-- task #16, scoped from a founder wireframe: an admin creates auto-
-- numbered groups ("Group 1", "Group 2", ...) under a race, adds members
-- to each (scoped to who already has access to the race, not the whole
-- club), and designates one "Incharge" per group. A person can only be
-- in one group per race — enforced with a unique(race_id, user_id)
-- constraint on the membership table, which is why race_id is
-- denormalized onto it rather than only living on race_car_groups.

create table public.race_car_groups (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  name text not null,
  incharge_user_id uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.race_car_group_members (
  car_group_id uuid not null references public.race_car_groups (id) on delete cascade,
  race_id uuid not null references public.races (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid not null references public.profiles (id),
  added_at timestamptz not null default now(),
  primary key (car_group_id, user_id),
  unique (race_id, user_id)
);

-- "Does this user currently have access to this race at all" — either an
-- approved race_members row, or a club admin (who has automatic full
-- race access, same as everywhere else in the race sub-flow). Used to
-- scope the add-member pool to the race's own roster, not the whole club.
create function public.is_user_race_participant(p_race_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select
    exists (select 1 from public.race_members where race_id = p_race_id and user_id = p_user_id)
    or exists (
      select 1 from public.races r
      join public.club_members cm on cm.club_id = r.club_id
      where r.id = p_race_id and cm.user_id = p_user_id and cm.role = 'admin'
    );
$$;

alter table public.race_car_groups enable row level security;
alter table public.race_car_group_members enable row level security;

-- Visible to anyone with race access (admin or approved member) — same
-- gating as the race's own chat/roster; writes are admin-only throughout,
-- there's no self-service carpool organizing.
create policy "race participants can read car groups"
  on public.race_car_groups for select
  to authenticated
  using (public.is_race_admin(race_id) or public.is_race_member(race_id));

create policy "race admins can create car groups"
  on public.race_car_groups for insert
  to authenticated
  with check (public.is_race_admin(race_id) and created_by = auth.uid());

-- No client-facing update path exists yet (incharge is set via the RPC
-- below, which is security-definer and bypasses RLS) — this policy exists
-- so the table isn't silently unwritable if a future direct-update path
-- is added, matching the belt-and-suspenders style already used for
-- race_members's insert policy.
create policy "race admins can update car groups"
  on public.race_car_groups for update
  to authenticated
  using (public.is_race_admin(race_id))
  with check (public.is_race_admin(race_id));

create policy "race participants can read car group members"
  on public.race_car_group_members for select
  to authenticated
  using (public.is_race_admin(race_id) or public.is_race_member(race_id));

create policy "race admins can add car group members"
  on public.race_car_group_members for insert
  to authenticated
  with check (
    public.is_race_admin(race_id)
    and public.is_user_race_participant(race_id, user_id)
    and added_by = auth.uid()
  );

create policy "race admins can remove car group members"
  on public.race_car_group_members for delete
  to authenticated
  using (public.is_race_admin(race_id));

-- If the person removed was their group's Incharge, don't leave a stale
-- reference to someone no longer in the group.
create function public.clear_incharge_on_member_removed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.race_car_groups
  set incharge_user_id = null
  where id = old.car_group_id and incharge_user_id = old.user_id;

  return old;
end;
$$;

create trigger on_car_group_member_removed
  after delete on public.race_car_group_members
  for each row execute function public.clear_incharge_on_member_removed();

-- Setting Incharge is its own RPC (rather than a plain client update) so
-- it can validate the target is actually a current member of that group
-- — the wireframe's "admin can make anyone Incharge" means anyone in the
-- group, not literally anyone. Pass p_user_id = null to clear it.
create function public.set_car_group_incharge(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  grp public.race_car_groups;
begin
  select * into grp from public.race_car_groups where id = p_group_id;
  if grp.id is null then
    raise exception 'Group not found';
  end if;
  if not public.is_race_admin(grp.race_id) then
    raise exception 'Not authorized';
  end if;
  if p_user_id is not null and not exists (
    select 1 from public.race_car_group_members
    where car_group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'User is not a member of this group';
  end if;

  update public.race_car_groups set incharge_user_id = p_user_id where id = p_group_id;
end;
$$;
