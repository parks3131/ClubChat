-- Founder follow-up tightening admin access to Race/Eboard from implicit
-- (is_club_admin/is_race_admin checks, no real roster row for most
-- admins) to explicit, individually-manageable membership:
--   1. Creating a race or the Eboard channel now adds *every* current
--      club admin as a real race_members/eboard_channel_members row, not
--      just whoever happened to click create.
--   2. Promoting a member to admin immediately adds them to Eboard (if it
--      exists) and to every upcoming race (event_date >= current_date)
--      in that club. Demoting reverses both, for upcoming races only —
--      a race that's already happened is left untouched.
--   3. Regular (non-admin) race members are unaffected — still
--      request/admin-add only.
--   4. Removing an *admin* from a race or from Eboard is now restricted
--      to the club's original creator (mirrors the creator-only Delete
--      Club policy from 0040_club_eboard_delete.sql); any admin can
--      still remove a non-admin race member, unchanged. Since every
--      Eboard member is guaranteed to already be a club admin (enforced
--      by 0017's insert policy), this fully replaces 0039's "any
--      existing member can remove another" with "only the creator can" —
--      a deliberate narrowing, not an oversight.

create function public.is_club_creator(p_club_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.clubs where id = p_club_id and created_by = auth.uid()
  );
$$;

create function public.is_race_club_creator(p_race_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_club_creator(club_id) from public.races where id = p_race_id;
$$;

create function public.is_eboard_club_creator(p_eboard_channel_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_club_creator(club_id) from public.eboard_channels where id = p_eboard_channel_id;
$$;

-- Bulk-adds every current club admin (not just created_by) and, while
-- being re-created anyway, fixes a latent ordering bug found in this
-- task: the channel insert happened *after* the race_members insert, so
-- log_race_member_added's own channel lookup always found nothing and
-- silently skipped the "joined"/"added by" system message and
-- notification for the very first row(s) inserted here. Harmless with
-- one row (the creator); would have silently swallowed every newly
-- auto-added admin's notification below, so fixed as part of this change.
create or replace function public.handle_new_race()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.channels (club_id, race_id)
  values (new.club_id, new.id);

  insert into public.race_members (race_id, user_id)
  select new.id, cm.user_id
  from public.club_members cm
  where cm.club_id = new.club_id and cm.role = 'admin'
  on conflict (race_id, user_id) do nothing;

  return new;
end;
$$;

-- Same two fixes as handle_new_race above (bulk-add every admin,
-- channel-before-members ordering).
create or replace function public.handle_new_eboard_channel()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.channels (club_id, eboard_channel_id)
  values (new.club_id, new.id);

  insert into public.eboard_channel_members (eboard_channel_id, user_id)
  select new.id, cm.user_id
  from public.club_members cm
  where cm.club_id = new.club_id and cm.role = 'admin'
  on conflict (eboard_channel_id, user_id) do nothing;

  return new;
end;
$$;

-- A second, independent after-update-of-role trigger alongside the
-- existing log_member_role_changed (system message + notification) —
-- kept separate rather than merged into that already-dense function.
create function public.handle_admin_role_membership_sync()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role = old.role then
    return new;
  end if;

  if new.role = 'admin' then
    insert into public.eboard_channel_members (eboard_channel_id, user_id)
    select ec.id, new.user_id
    from public.eboard_channels ec
    where ec.club_id = new.club_id
    on conflict (eboard_channel_id, user_id) do nothing;

    insert into public.race_members (race_id, user_id)
    select r.id, new.user_id
    from public.races r
    where r.club_id = new.club_id and r.event_date >= current_date
    on conflict (race_id, user_id) do nothing;
  else
    -- Demoted: leave Eboard and every still-upcoming race. Mirrors
    -- lib/races.ts's removeRaceMember ordering — car-group membership
    -- first, since race_car_group_members has no FK cascade back to
    -- race_members and would otherwise leave a stale (possibly Incharge)
    -- row behind. Past/finished races are left untouched entirely.
    delete from public.race_car_group_members
    where user_id = new.user_id
      and race_id in (
        select id from public.races where club_id = new.club_id and event_date >= current_date
      );

    delete from public.race_members
    where user_id = new.user_id
      and race_id in (
        select id from public.races where club_id = new.club_id and event_date >= current_date
      );

    delete from public.eboard_channel_members
    where user_id = new.user_id
      and eboard_channel_id in (
        select id from public.eboard_channels where club_id = new.club_id
      );
  end if;

  return new;
end;
$$;

create trigger on_club_member_role_changed_membership_sync
  after update of role on public.club_members
  for each row execute function public.handle_admin_role_membership_sync();

-- race_members DELETE: fork on whether the target is currently a club
-- admin. Two permissive policies (OR'd by Postgres) instead of one
-- combined expression, for readability.
drop policy "admins can remove race members" on public.race_members;

create policy "admins can remove non-admin race members"
  on public.race_members for delete
  to authenticated
  using (
    public.is_race_admin(race_id)
    and not public.is_user_club_admin((select club_id from public.races where id = race_id), user_id)
  );

create policy "club creator can remove any race member"
  on public.race_members for delete
  to authenticated
  using (public.is_race_club_creator(race_id));

-- eboard_channel_members DELETE: since every member is already
-- guaranteed to be a club admin, this is a straight replacement of
-- 0039's "any existing member" with "only the creator" — self-removal
-- stays blocked, same as 0039 originally intended.
drop policy "eboard members can remove other members" on public.eboard_channel_members;

create policy "club creator can remove eboard members"
  on public.eboard_channel_members for delete
  to authenticated
  using (public.is_eboard_club_creator(eboard_channel_id) and user_id <> auth.uid());
