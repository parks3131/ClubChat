-- Separate bucket from 'avatars' (profile pictures) because ownership
-- here is "club admin", not "the uploading user" — the RLS check below
-- keys off the club_id in the folder name via is_club_admin(), not
-- auth.uid() directly like 0010_avatar_storage.sql does.
insert into storage.buckets (id, name, public)
values ('club-avatars', 'club-avatars', true)
on conflict (id) do nothing;

create policy "club avatars are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'club-avatars');

create policy "club admins can upload their club avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'club-avatars'
    and public.is_club_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "club admins can update their club avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'club-avatars'
    and public.is_club_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'club-avatars'
    and public.is_club_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "club admins can delete their club avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'club-avatars'
    and public.is_club_admin(((storage.foldername(name))[1])::uuid)
  );
