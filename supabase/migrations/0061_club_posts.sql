-- News & Highlights: a standalone admin-post feed (photo + club update
-- text), separate from chat's pinned/announcements — a founder call after
-- the club-hub restructure gave this its own row instead of aliasing the
-- existing Pinned/Announcements screen. Any club admin can post, edit, or
-- delete any post (matches Race Meet Info/Routines/Events, not Eboard
-- Meetings' creator-only model — an explicit founder choice, confirmed
-- rather than assumed).
create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  body text,
  media_url text,
  created_at timestamptz not null default now()
);

create index on public.club_posts (club_id, created_at desc);

alter table public.club_posts enable row level security;

-- Bound directly to the row's own club_id column (is_club_member queries
-- club_members, not club_posts itself) — safe under INSERT...RETURNING
-- per SPEC.md section 6's second RLS gotcha, unlike a self-referential
-- "look this row up again by id" check would be.
create policy "club members can read posts"
  on public.club_posts for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "club admins can create posts"
  on public.club_posts for insert
  to authenticated
  with check (created_by = auth.uid() and public.is_club_admin(club_id));

create policy "club admins can edit posts"
  on public.club_posts for update
  to authenticated
  using (public.is_club_admin(club_id));

create policy "club admins can delete posts"
  on public.club_posts for delete
  to authenticated
  using (public.is_club_admin(club_id));
