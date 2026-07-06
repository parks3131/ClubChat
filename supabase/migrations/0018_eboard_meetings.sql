-- Meetings, the second item in Eboard & Council's hub (task #17's
-- SECTIONS was ["Chat", "Meetings"], the latter a placeholder). From a
-- founder wireframe: date+time, title, description, and a meeting link
-- (Zoom/Meet/etc). The wireframe sketched a calendar-grid date picker and
-- an AM/PM time stepper, but explicitly flagged that as UI polish that
-- "can do later" — this uses the same plain YYYY-MM-DD + HH:MM text
-- fields already established for calendar events/races/DOB throughout
-- the app (see event/create.tsx), combined client-side into a timestamp.

create table public.eboard_meetings (
  id uuid primary key default gen_random_uuid(),
  eboard_channel_id uuid not null references public.eboard_channels (id) on delete cascade,
  title text not null,
  description text,
  meeting_link text,
  meeting_at timestamptz not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.eboard_meetings enable row level security;

-- Same "no separate eboard admin role" reasoning as the rest of this
-- feature (migration 0017): every eboard_channel_member is already
-- guaranteed to be a club admin, so any member can create/edit/delete
-- meetings — no extra role needed.
create policy "eboard members can read meetings"
  on public.eboard_meetings for select
  to authenticated
  using (public.is_eboard_member(eboard_channel_id));

create policy "eboard members can create meetings"
  on public.eboard_meetings for insert
  to authenticated
  with check (public.is_eboard_member(eboard_channel_id) and created_by = auth.uid());

create policy "eboard members can update meetings"
  on public.eboard_meetings for update
  to authenticated
  using (public.is_eboard_member(eboard_channel_id))
  with check (public.is_eboard_member(eboard_channel_id));

create policy "eboard members can delete meetings"
  on public.eboard_meetings for delete
  to authenticated
  using (public.is_eboard_member(eboard_channel_id));
