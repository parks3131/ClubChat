-- Weekly routines: admin-authored workouts for a specific calendar date
-- (dated per real week, not a repeating Mon-Sun template, so training can
-- progress week over week). Kept deliberately simple (title + description
-- only, no structured exercise builder) per an explicit "very simple"
-- scoping call.

create type public.routine_activity_type as enum (
  'run', 'trail_run', 'bike', 'swim', 'strength',
  'hybrid_fitness', 'indoor_climb', 'bouldering', 'xc_ski', 'other'
);

create table public.routine_workouts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  workout_date date not null,
  activity_type public.routine_activity_type not null,
  title text not null,
  description text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index on public.routine_workouts (club_id, workout_date);

alter table public.routine_workouts enable row level security;

-- Creator is already a club member (must be an admin) at insert time,
-- unlike the clubs-table chicken-and-egg case in SPEC.md section 6 — no
-- special "or created_by = auth.uid()" carve-out needed for
-- INSERT ... RETURNING to see its own row.
create policy "members can read club routines"
  on public.routine_workouts for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "admins can create routines"
  on public.routine_workouts for insert
  to authenticated
  with check (public.is_club_admin(club_id) and created_by = auth.uid());

create policy "admins can update routines"
  on public.routine_workouts for update
  to authenticated
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

create policy "admins can delete routines"
  on public.routine_workouts for delete
  to authenticated
  using (public.is_club_admin(club_id));
