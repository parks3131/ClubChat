-- Founder request: a member should be able to leave a race or Eboard &
-- Council on their own, not just be removed by an admin. Club-level
-- self-leave already existed (0043's "members can leave except the
-- owner" policy) — race_members and eboard_channel_members never got the
-- equivalent. race_members' only DELETE policy is is_race_admin(race_id)
-- (0044), which lets a race admin remove anyone including themselves but
-- gives a plain member no path at all; eboard_channel_members' only
-- DELETE policy (0043) explicitly excludes self (`user_id <> auth.uid()`)
-- — self-removal was deliberately blocked there, not just missing.
--
-- Both are added as permissive policies alongside the existing ones
-- (Postgres OR's permissive policies for the same command together), so
-- existing admin-removal behavior is untouched.
create policy "members can leave a race"
  on public.race_members for delete
  to authenticated
  using (user_id = auth.uid());

create policy "members can leave eboard"
  on public.eboard_channel_members for delete
  to authenticated
  using (user_id = auth.uid());

-- Leaving the club entirely (club_members DELETE, already self-leave-able
-- since 0043) already cascades correctly with no further changes needed:
-- handle_club_member_removed_membership_sync (0043) already deletes the
-- leaver's race_car_group_members / race_members / eboard_channel_members
-- rows for that club, so "leave main chat -> out of everything" already
-- works once the club-profile UI calls the existing removeMember(...).
-- Leaving a single race directly already gets the same car-group cleanup
-- too, since lib/races.ts's removeRaceMember (reused for both admin-
-- removal and the new self-leave path) already deletes the matching
-- race_car_group_members row before deleting race_members itself.

-- clear_incharge_on_member_removed (0021) already nulls out a car group's
-- incharge_user_id when that member is removed from race_car_group_members
-- for any reason (self-leave, admin removal, or cascading from a race/club
-- leave) — but did so silently. Extended here to also notify every admin/
-- owner of the race's club when the removed member *was* the group's
-- Incharge specifically (a plain member leaving a group stays a non-event,
-- exactly as asked) — the rest of the group's roster is left untouched,
-- just without an Incharge until an admin assigns a new one.
create or replace function public.clear_incharge_on_member_removed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  cleared_group public.race_car_groups;
  target_race public.races;
  leaver_name text;
begin
  update public.race_car_groups
  set incharge_user_id = null
  where id = old.car_group_id and incharge_user_id = old.user_id
  returning * into cleared_group;

  if cleared_group.id is not null then
    select * into target_race from public.races where id = old.race_id;
    select full_name into leaver_name from public.profiles where id = old.user_id;

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select
      cm.user_id, old.user_id, target_race.club_id, 'car_group_incharge_left',
      coalesce(leaver_name, 'A member') || ' left ' || cleared_group.name || ' with no Incharge assigned — action needed for ' || target_race.name || '.',
      '/clubs/' || target_race.club_id || '/race/' || target_race.id || '/carpool'
    from public.club_members cm
    where cm.club_id = target_race.club_id
      and cm.role in ('admin', 'owner')
      and cm.user_id <> old.user_id;
  end if;

  return old;
end;
$$;
