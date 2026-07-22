-- Founder request: every club should get its Eboard & Council automatically
-- at creation time (owner auto-joined immediately), instead of requiring an
-- admin to hit the "+ Create" prompt on eboard/index.tsx manually. Future
-- admin promotions already auto-join Eboard via
-- handle_admin_role_membership_sync (0043) — the only missing piece is the
-- channel itself existing in the first place.
--
-- handle_new_club re-created a second time (0043 was the first, for the
-- owner-role rewrite) to insert an eboard_channels row right after the
-- owner's own club_members row. Order matters: handle_new_eboard_channel's
-- bulk-add reads club_members at the moment it fires, so the owner row must
-- already exist or they'd be silently excluded from their own club's
-- Eboard. Reuses the existing on_eboard_channel_created trigger for the
-- channel + membership insert rather than duplicating that logic here.
create or replace function public.handle_new_club()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.club_members (club_id, user_id, role)
  values (new.id, new.created_by, 'owner');

  insert into public.channels (club_id)
  values (new.id);

  insert into public.eboard_channels (club_id, name, created_by)
  values (new.id, 'Eboard & Council', new.created_by);

  return new;
end;
$$;

-- Backfill for every existing club that predates this migration and never
-- had an admin manually create one — same "close the gap retroactively"
-- precedent as 0043's own eboard_channel_members backfill. Fires
-- on_eboard_channel_created per row, which handles the channel +
-- current-admins-and-owner membership insert the same way a fresh club's
-- auto-created row does above.
insert into public.eboard_channels (club_id, name, created_by)
select c.id, 'Eboard & Council', c.created_by
from public.clubs c
where not exists (
  select 1 from public.eboard_channels ec where ec.club_id = c.id
);
