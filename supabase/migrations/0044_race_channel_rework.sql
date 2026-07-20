-- Reworks race-channel membership to be creator/admin-controlled with a
-- request-to-join flow, mirroring how the Eboard channel already works —
-- this REPLACES 0041's race-related behavior (auto-bulk-add every admin
-- on race creation, auto-join upcoming races on promotion), it does not
-- extend it. Per the new spec: "Any Admin or the Owner can create a race
-- channel. The creator chooses which Admins and/or Members to add...
-- Anyone NOT added by the creator — including the Owner or other Admins
-- if they weren't added — must submit a join request to gain access."
--
-- Management authority (approve/deny join requests, add/remove members
-- after creation) stays "creator + any Admin/Owner" — which is already
-- exactly what is_race_admin(race_id) (= is_club_admin(club_id), which
-- now includes Owner via 0043's redefinition) has always meant, since a
-- race can only be created by a club admin/owner in the first place. So
-- request_join_race/decide_race_join_request and their policies need no
-- changes at all — only chat *access* (is_channel_member/is_channel_admin)
-- and the auto-add behavior change.

-- handle_new_race drops its "bulk-insert every current club admin into
-- race_members" block (added by 0041) — that's exactly the automatic
-- membership this rework removes. The creator is still auto-added; that
-- was always separate, unrelated behavior (same as clubs/Eboard).
create or replace function public.handle_new_race()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.channels (club_id, race_id)
  values (new.club_id, new.id);

  insert into public.race_members (race_id, user_id)
  values (new.id, new.created_by);

  return new;
end;
$$;

-- is_channel_member (race branch): stop treating "is a club admin/owner"
-- as a substitute for "was actually added to this race." Even the Owner
-- or another Admin who wasn't added now needs a real race_members row,
-- exactly like a plain Member always has.
create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case
    when c.race_id is not null then public.is_race_member(c.race_id)
    when c.eboard_channel_id is not null then public.is_eboard_member(c.eboard_channel_id)
    else public.is_club_member(c.club_id)
  end
  from public.channels c where c.id = p_channel_id;
$$;

-- is_channel_admin (race branch): pin/announce rights now require *both*
-- being an approved participant (real race_members row) *and* being a
-- club Admin/Owner — an unadded Admin gets neither chat access nor
-- chat-admin rights on a race they haven't joined; a plain approved
-- Member keeps participant access without pin/announce, unchanged.
create or replace function public.is_channel_admin(p_channel_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case
    when c.race_id is not null then public.is_race_member(c.race_id) and public.is_race_admin(c.race_id)
    when c.eboard_channel_id is not null then public.is_eboard_member(c.eboard_channel_id)
    else public.is_club_admin(c.club_id)
  end
  from public.channels c where c.id = p_channel_id;
$$;

-- race_members DELETE simplifies back to the single pre-0041 policy.
-- 0041's two-tier admin/non-admin split ("club creator can remove any
-- race member" vs "admins can remove non-admin race members") doesn't
-- map to anything in the new spec — no "only the Owner can remove an
-- admin from one race" rule was requested (unlike the club-wide
-- remove_admin rule in 0043), and race management authority is uniformly
-- "creator + any Admin/Owner" per the founder's own answer.
drop policy "admins can remove non-admin race members" on public.race_members;
drop policy "club creator can remove any race member" on public.race_members;

create policy "race admins can remove race members"
  on public.race_members for delete
  to authenticated
  using (public.is_race_admin(race_id));

-- is_race_club_creator (from 0041) has no remaining callers now that its
-- one policy above is gone.
drop function public.is_race_club_creator(uuid);

-- Same latent "admin automatically has race access" assumption, found in
-- a third place while auditing this rework: is_user_race_participant
-- (backs race_car_groups membership, 0021_race_car_groups.sql) let *any*
-- club admin be assigned to a car group for a race they never actually
-- joined — a leftover from the old auto-access model, same class of bug
-- as handle_new_race's removed bulk-add above. Car-group membership now
-- requires a real race_members row, same as chat access.
create or replace function public.is_user_race_participant(p_race_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (select 1 from public.race_members where race_id = p_race_id and user_id = p_user_id);
$$;

-- request_join_race's "already have access, no-op" short-circuit checked
-- is_race_admin(...) OR is_race_member(...) — correct under the old model
-- where is_race_admin implied chat access, but wrong now: a manager
-- (club Admin/Owner) who hasn't actually been added no longer has chat
-- access, so their request needs to go through the real pending-request
-- flow like anyone else's, not silently no-op and report 'joined' while
-- never inserting a race_members row. Found live while testing this
-- migration — the original condition made a manager's own join request
-- silently do nothing.
create or replace function public.request_join_race(target_race_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_race_club_member(target_race_id) then
    raise exception 'Not a member of this club';
  end if;

  if public.is_race_member(target_race_id) then
    return 'joined';
  end if;

  insert into public.race_join_requests (race_id, user_id, status)
  values (target_race_id, auth.uid(), 'pending')
  on conflict (race_id, user_id)
  do update set status = 'pending', created_at = now(), decided_at = null, decided_by = null
  where public.race_join_requests.status <> 'pending';

  return 'requested';
end;
$$;
