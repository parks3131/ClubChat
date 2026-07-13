-- Founder-reported gap: a race admin could add members to a race's
-- roster but had no way to remove one — race_members (0016_races.sql)
-- shipped with select/insert policies only, no delete policy at all, so
-- the table was silently un-deletable via the client. Same class of gap
-- as 0022_race_car_groups_delete.sql (add shipped, delete didn't, added
-- right after in its own migration).
create policy "admins can remove race members"
  on public.race_members for delete
  to authenticated
  using (public.is_race_admin(race_id));
