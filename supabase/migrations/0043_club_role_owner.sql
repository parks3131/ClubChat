-- Introduces a real three-tier role hierarchy — Owner > Admin > Member —
-- replacing the implicit, non-transferable "creator" concept
-- (clubs.created_by) that a few high-blast-radius policies (Delete Club,
-- remove-from-Eboard) relied on until now. There is exactly one Owner per
-- club at all times (enforced by a DB-level partial unique index, not just
-- application logic); ownership is transferable via a new RPC.
--
-- Permission matrix this migration implements (club-wide, not race/Eboard-
-- specific — those are handled separately below/in 0044):
--   promote_to_admin        Owner or Admin -> promotes a Member to Admin
--   demote_admin_to_member  Owner or Admin -> demotes an Admin to Member
--   remove_member           Owner or Admin -> removes a Member outright
--   remove_admin            Owner only     -> removes an Admin outright
--   transfer_ownership      Owner only     -> hands the Owner role to any
--                                             other current club member;
--                                             the outgoing Owner becomes an
--                                             Admin (confirmed default)
--
-- club_role is a Postgres enum (not a text+check column); the new
-- 'owner' value was added in 0042_club_role_owner_enum.sql, its own
-- migration file — see that file's comment for why it couldn't just be
-- the first statement here.

-- Backfill: every existing club's creator becomes its Owner, regardless
-- of their current role (not filtered to role = 'admin' — handle_new_club
-- has always inserted the creator as 'admin', but this is defensive
-- against any club whose creator was since demoted for some reason).
update public.club_members cm
set role = 'owner'
from public.clubs c
where c.id = cm.club_id and c.created_by = cm.user_id;

-- DB-level "exactly one Owner per club" invariant — not just app logic.
create unique index one_owner_per_club on public.club_members (club_id) where role = 'owner';

-- New clubs: the creator becomes Owner (not Admin) going forward.
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

  return new;
end;
$$;

-- is_club_admin now covers Owner too (Owner is a strict superset of Admin
-- for every existing is_club_admin(...)-gated policy across the app —
-- calendar, routines, polls, races, etc. — so this one-line change makes
-- Owner inherit all of them for free with zero other policy edits).
create or replace function public.is_club_admin(p_club_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = auth.uid() and role in ('admin', 'owner')
  );
$$;

-- Owner-exclusive checks (remove_admin, transfer_ownership, Delete Club,
-- remove-from-Eboard).
create function public.is_club_owner(p_club_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- club_members UPDATE (promote_to_admin / demote_admin_to_member): any
-- Owner or Admin can toggle a member/admin row either direction —
-- symmetric, no self-target restriction, matching this policy's existing
-- convention. The Owner's own row is untouchable through this generic
-- path (using clause excludes role = 'owner' on the pre-update row), and
-- role = 'owner' can never be *set* through it either (with check) — the
-- only way to create an Owner row is transfer_ownership() below.
drop policy "admins can change member roles" on public.club_members;

create policy "owner or admin can promote/demote member<->admin"
  on public.club_members for update
  to authenticated
  using (public.is_club_admin(club_id) and role <> 'owner')
  with check (role in ('member', 'admin'));

-- club_members DELETE (remove_member / remove_admin / leave): three
-- permissive policies (Postgres OR's them together), mirroring the shape
-- 0041 already used for race_members's admin/non-admin split.
drop policy "admins can remove members, members can leave" on public.club_members;

-- Anyone can leave except the Owner — a direct, DB-enforced consequence
-- of "exactly one Owner at all times": if the Owner could self-remove,
-- the club would be left ownerless. Not explicitly specified in the
-- permission brief; flagged in SPEC.md/plan as an inferred safety default
-- rather than a literal requirement.
create policy "members can leave except the owner"
  on public.club_members for delete
  to authenticated
  using (user_id = auth.uid() and role <> 'owner');

-- remove_member: Owner or Admin removes a Member.
create policy "owner or admin can remove a member"
  on public.club_members for delete
  to authenticated
  using (public.is_club_admin(club_id) and role = 'member');

-- remove_admin: only the Owner removes an Admin outright.
create policy "only owner can remove an admin"
  on public.club_members for delete
  to authenticated
  using (public.is_club_owner(club_id) and role = 'admin');

-- transfer_ownership: security definer RPC, mirrors decide_join_request's
-- pattern. Demotes the caller to 'admin' *before* promoting the target to
-- 'owner' — the partial unique index above is checked per-statement (not
-- deferred), so promoting the new owner first would momentarily create two
-- 'owner' rows for the same club and fail; demoting first passes through
-- zero owners momentarily (no uniqueness conflict) then adds exactly one.
create function public.transfer_ownership(target_club_id uuid, new_owner_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_club_owner(target_club_id) then
    raise exception 'Not authorized';
  end if;

  if new_owner_user_id = auth.uid() then
    raise exception 'Already the owner';
  end if;

  if not exists (
    select 1 from public.club_members where club_id = target_club_id and user_id = new_owner_user_id
  ) then
    raise exception 'Target is not a member of this club';
  end if;

  update public.club_members set role = 'admin' where club_id = target_club_id and user_id = auth.uid();
  update public.club_members set role = 'owner' where club_id = target_club_id and user_id = new_owner_user_id;
end;
$$;

-- Delete Club: authority moves from the original creator to the *current*
-- Owner, since ownership is now transferable. The cascade that wipes
-- every club_members row (including the Owner's own, which the DELETE
-- policies above deliberately never allow removing directly) still
-- succeeds regardless of those restrictive policies — verified directly
-- against this project's local Postgres that FK ON DELETE CASCADE actions
-- are not subject to RLS on the child table at all (a row a restrictive
-- policy blocks from *direct* deletion is still genuinely removed, not
-- orphaned, when removed via cascade from the parent).
drop policy "creator can delete their club" on public.clubs;

create policy "owner can delete their club"
  on public.clubs for delete
  to authenticated
  using (public.is_club_owner(id));

-- Eboard's "manual kick" policy (distinct from the automatic role-driven
-- cleanup trigger below) moves from creator-only to owner-only, for the
-- same reason as Delete Club above.
drop policy "club creator can remove eboard members" on public.eboard_channel_members;

create function public.is_eboard_club_owner(p_eboard_channel_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_club_owner(club_id) from public.eboard_channels where id = p_eboard_channel_id;
$$;

create policy "club owner can remove eboard members"
  on public.eboard_channel_members for delete
  to authenticated
  using (public.is_eboard_club_owner(eboard_channel_id) and user_id <> auth.uid());

-- The old creator-based helpers are superseded by the owner-based ones
-- above (is_club_owner, is_eboard_club_owner). Dropped in caller-before-
-- callee order (is_eboard_club_creator calls is_club_creator internally)
-- even though a `language sql` function body isn't actually tracked as a
-- hard drop-dependency in Postgres — verified directly, dropping the
-- callee first doesn't error either — this order is just clearer to a
-- future reader. is_race_club_creator (also calls is_club_creator) is
-- dropped in 0044 alongside the race_members policy that used it, kept
-- local to that migration since it's a race-membership-model change; it's
-- harmless for it to briefly reference an already-dropped function since
-- nothing calls it again before 0044 runs in the same deploy.
drop function public.is_eboard_club_creator(uuid);
drop function public.is_club_creator(uuid);

-- Tier-aware rewrite of 0041's handle_admin_role_membership_sync. The old
-- version branched on `new.role = 'admin'` (binary), which breaks now that
-- 'owner' exists: an ownership transfer would make the outgoing Owner
-- (owner -> admin) look like a demotion (wrongly ejected from Eboard) and
-- the incoming Owner (member/admin -> owner) look like neither promotion
-- nor demotion (wrongly left out of Eboard if they weren't already an
-- Admin). Fixed by comparing "admin-tier" membership (admin or owner)
-- before/after instead of the raw role value — an admin<->owner
-- transition (i.e. any ownership transfer) is a no-op here, since both
-- sides of that transition already have/keep Eboard+race access.
--
-- This version also only syncs Eboard, not races — the "auto-join
-- upcoming races" behavior 0041 added is removed entirely by 0044, which
-- reverses race-channel membership back to creator/admin-controlled, not
-- automatic. Rewriting the whole function body once here (rather than
-- once now and again in 0044) avoids a pointless double edit.
create or replace function public.handle_admin_role_membership_sync()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  was_admin_tier boolean := old.role in ('admin', 'owner');
  is_admin_tier boolean := new.role in ('admin', 'owner');
begin
  if was_admin_tier = is_admin_tier then
    return new;
  end if;

  if is_admin_tier then
    insert into public.eboard_channel_members (eboard_channel_id, user_id)
    select ec.id, new.user_id
    from public.eboard_channels ec
    where ec.club_id = new.club_id
    on conflict (eboard_channel_id, user_id) do nothing;
  else
    delete from public.eboard_channel_members
    where user_id = new.user_id
      and eboard_channel_id in (
        select id from public.eboard_channels where club_id = new.club_id
      );
  end if;

  return new;
end;
$$;

-- handle_new_eboard_channel's bulk-add query literally checked
-- role = 'admin', which would miss the club's Owner (role = 'owner') when
-- the channel is first created. Re-created a fourth time (0016, 0017, 0041
-- already touched this function for other reasons) with the one-line fix.
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
  where cm.club_id = new.club_id and cm.role in ('admin', 'owner')
  on conflict (eboard_channel_id, user_id) do nothing;

  return new;
end;
$$;

-- Retroactive backfill for existing Eboard channels: the "Owner and all
-- current Admins are always members" invariant should hold immediately,
-- not just for role changes/channel creations from this point forward.
-- Found while testing this migration against a copy of live data — an
-- existing eboard_channel had 2 of its club's admins as members but not
-- the club's creator/Owner at all (that channel predates even 0041's own
-- bulk-add-on-creation fix, so it was never swept in retroactively
-- either). Closes that gap for every existing club, not just this one.
insert into public.eboard_channel_members (eboard_channel_id, user_id)
select ec.id, cm.user_id
from public.eboard_channels ec
join public.club_members cm on cm.club_id = ec.club_id and cm.role in ('admin', 'owner')
on conflict (eboard_channel_id, user_id) do nothing;

-- Pre-existing gap (not introduced by this migration, found while reading
-- the schema for this task): removing someone from club_members outright
-- (remove_member or the new remove_admin) never cleaned up their
-- race_members / eboard_channel_members rows at all — only role
-- *demotion* was ever handled (by 0041's trigger above). Since they're no
-- longer a club member at all once removed, this revokes access to every
-- race (not just upcoming ones, unlike the demote case above — losing
-- club membership entirely is more severe than losing admin status, so
-- there's no "leave past-race history untouched" carve-out here) and the
-- Eboard channel. Runs for every removal regardless of the removed row's
-- role — a no-op for a plain Member, who never had these rows anyway
-- under the request/add-only race model.
create function public.handle_club_member_removed_membership_sync()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.race_car_group_members
  where user_id = old.user_id
    and race_id in (select id from public.races where club_id = old.club_id);

  delete from public.race_members
  where user_id = old.user_id
    and race_id in (select id from public.races where club_id = old.club_id);

  delete from public.eboard_channel_members
  where user_id = old.user_id
    and eboard_channel_id in (select id from public.eboard_channels where club_id = old.club_id);

  return old;
end;
$$;

create trigger on_club_member_removed_membership_sync
  after delete on public.club_members
  for each row execute function public.handle_club_member_removed_membership_sync();

-- log_member_role_changed re-created a third time (0016, 0017 already
-- touched it for the channel-lookup fix) to branch on the actual role
-- values instead of the old binary admin/not-admin check, and to post a
-- single clear message for an ownership transfer instead of two
-- confusing ones (the outgoing owner->admin side is suppressed; the
-- incoming ?->owner side posts the real message). Reuses the existing
-- 'role_changed' notification type — no new enum value needed.
create or replace function public.log_member_role_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_channel uuid;
  member_name text;
  actor_id uuid := auth.uid();
  actor_name text;
  club_name text;
  body text;
  notif_body text;
  skip boolean := false;
begin
  if new.role = old.role then
    return new;
  end if;

  select id into target_channel from public.channels where club_id = new.club_id and race_id is null and eboard_channel_id is null;
  if target_channel is null or actor_id is null then
    return new;
  end if;

  select full_name into member_name from public.profiles where id = new.user_id;
  select full_name into actor_name from public.profiles where id = actor_id;
  select name into club_name from public.clubs where id = new.club_id;

  if new.role = 'admin' and old.role = 'member' then
    body := coalesce(member_name, 'Someone') || ' was promoted to admin by ' || coalesce(actor_name, 'an admin');
    notif_body := 'You were promoted to admin in ' || coalesce(club_name, 'a club') || ' by ' || coalesce(actor_name, 'an admin');
  elsif new.role = 'member' then
    body := coalesce(member_name, 'Someone') || ' was removed as admin by ' || coalesce(actor_name, 'an admin');
    notif_body := 'You were removed as admin in ' || coalesce(club_name, 'a club') || ' by ' || coalesce(actor_name, 'an admin');
  elsif new.role = 'owner' then
    body := 'Ownership was transferred to ' || coalesce(member_name, 'a member') || ' by ' || coalesce(actor_name, 'the previous owner');
    notif_body := 'You are now the owner of ' || coalesce(club_name, 'a club');
  else
    -- old.role = 'owner', new.role = 'admin': the outgoing side of the
    -- same transfer the new-owner branch above already announced once.
    skip := true;
  end if;

  if skip then
    return new;
  end if;

  insert into public.messages (channel_id, sender_id, message_type, body)
  values (target_channel, actor_id, 'system', body);

  if actor_id <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (new.user_id, actor_id, new.club_id, 'role_changed', notif_body, '/clubs/' || new.club_id);
  end if;

  return new;
end;
$$;
