-- Race/Eboard pictures, mirroring 0013/0014_club_avatar*.sql exactly:
-- an avatar_url column plus a dedicated public Storage bucket (separate
-- from 'club-avatars' since ownership here keys off race/eboard
-- management authority, not "the club admin" the same way club avatars
-- do — is_race_admin/is_eboard_member instead of is_club_admin).

alter table public.races add column avatar_url text;
alter table public.eboard_channels add column avatar_url text;

-- races already has an UPDATE policy ("admins can update races",
-- 0016_races.sql) covering every column on the row, avatar_url included
-- — no RLS change needed there, same reasoning 0013 used for clubs.

-- eboard_channels never had an UPDATE policy at all (insert/select/
-- delete existed since 0017/0040, update didn't — a genuine gap, same
-- class of thing 0037/0039 closed for race_members/eboard_channel_members
-- DELETE). Needed now so name/description/avatar can be edited at all;
-- scoped to existing members, matching every other eboard write action's
-- "once inside, everyone has full rights" model (no separate "eboard
-- admin" role, same as chat pin/announce).
create policy "eboard members can update their channel"
  on public.eboard_channels for update
  to authenticated
  using (public.is_eboard_member(id))
  with check (public.is_eboard_member(id));

insert into storage.buckets (id, name, public)
values ('race-avatars', 'race-avatars', true)
on conflict (id) do nothing;

create policy "race avatars are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'race-avatars');

create policy "race admins can upload their race avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'race-avatars'
    and public.is_race_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "race admins can update their race avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'race-avatars'
    and public.is_race_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'race-avatars'
    and public.is_race_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "race admins can delete their race avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'race-avatars'
    and public.is_race_admin(((storage.foldername(name))[1])::uuid)
  );

insert into storage.buckets (id, name, public)
values ('eboard-avatars', 'eboard-avatars', true)
on conflict (id) do nothing;

create policy "eboard avatars are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'eboard-avatars');

create policy "eboard members can upload their eboard avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'eboard-avatars'
    and public.is_eboard_member(((storage.foldername(name))[1])::uuid)
  );

create policy "eboard members can update their eboard avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'eboard-avatars'
    and public.is_eboard_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'eboard-avatars'
    and public.is_eboard_member(((storage.foldername(name))[1])::uuid)
  );

create policy "eboard members can delete their eboard avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'eboard-avatars'
    and public.is_eboard_member(((storage.foldername(name))[1])::uuid)
  );
