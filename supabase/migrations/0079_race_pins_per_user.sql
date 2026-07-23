-- Founder correction: pinning a race is a personal, per-member thing
-- (curating your own club hub preview), not an admin-wide setting that
-- changes what everyone sees. Reverses 0078's races.pinned column (wrong
-- model: shared row state, admin-only via the existing races UPDATE
-- policy) in favor of a per-user row, same shape as channel_reads
-- (0031_notifications_core.sql) — presence of a row means "pinned by
-- this user", RLS-scoped entirely to the caller's own rows, no
-- membership check needed on insert (mirrors channel_reads' own policy
-- exactly).
alter table public.races drop column pinned;

create table public.race_pins (
  race_id uuid not null references public.races (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (race_id, user_id)
);

alter table public.race_pins enable row level security;

create policy "users manage their own race pins"
  on public.race_pins for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
