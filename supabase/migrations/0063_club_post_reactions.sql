-- Reactions on a News & Highlights post — mirrors message_reactions'
-- shape exactly (0001_init.sql/0003_rls.sql), same as message_mentions
-- (0058) already did for a different feature: not a new concept for this
-- codebase, just the same table shape scoped to a different parent.
create table public.club_post_reactions (
  post_id uuid not null references public.club_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

alter table public.club_post_reactions enable row level security;

create policy "club members can read post reactions"
  on public.club_post_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.club_posts p
      where p.id = post_id and public.is_club_member(p.club_id)
    )
  );

create policy "club members can react to posts"
  on public.club_post_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.club_posts p
      where p.id = post_id and public.is_club_member(p.club_id)
    )
  );

create policy "users can remove their own post reaction"
  on public.club_post_reactions for delete
  to authenticated
  using (user_id = auth.uid());
