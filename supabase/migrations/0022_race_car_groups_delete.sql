-- Follow-up to 0021: admins can delete a car group they created by
-- mistake or no longer need. race_car_group_members already cascades on
-- delete (its car_group_id FK), so removing a group cleanly removes its
-- membership rows too.
create policy "race admins can delete car groups"
  on public.race_car_groups for delete
  to authenticated
  using (public.is_race_admin(race_id));
