-- Found while verifying 0074's new race-leave path via RLS impersonation:
-- lib/races.ts's removeRaceMember (reused for self-leave by the previous
-- migration) deletes a race_car_group_members row before deleting
-- race_members, but race_car_group_members' only DELETE policy was
-- is_race_admin(race_id) (0021) — a plain, non-admin member leaving a
-- race couldn't clean up their own car-group membership at all (the
-- delete would silently affect 0 rows, no error, since it's an RLS
-- mismatch not a constraint violation), leaving a stale row in a group
-- they were removed from. Confirmed live via `set local role
-- authenticated` impersonation before writing this fix, and again after,
-- per SPEC.md section 6's RLS-impersonation verification technique.
create policy "members can leave their car group"
  on public.race_car_group_members for delete
  to authenticated
  using (user_id = auth.uid());
