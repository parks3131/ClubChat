-- Storage for News & Highlights post photos. Private (not public), same
-- reasoning as message-photos (0027): gated by the same is_club_member/
-- is_club_admin checks that already protect club_posts itself, not
-- servable to anyone holding a guessable URL. Objects are keyed as
-- `${clubId}/${uuid}.${ext}`, so the checks apply to the first path
-- segment for both read and write.
insert into storage.buckets (id, name, public)
values ('club-post-photos', 'club-post-photos', false)
on conflict (id) do nothing;

create policy "club members can view post photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'club-post-photos'
    and public.is_club_member(((storage.foldername(name))[1])::uuid)
  );

create policy "club admins can upload post photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'club-post-photos'
    and public.is_club_admin(((storage.foldername(name))[1])::uuid)
  );

-- No update/delete policy: a post's photo is replaced/removed via the
-- club_posts table (its own admin-only UPDATE/DELETE policy), which does
-- not cascade to the storage object — same accepted tradeoff as
-- message-photos (0027).
