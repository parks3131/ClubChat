-- Club Profile's edit screen (club-profile/edit.tsx) is being extended
-- to let admins change join_policy after creation, not just set it once
-- at creation time (createClub). Founder-requested behavior for the
-- request -> open transition specifically: anyone with a pending
-- club_join_requests row at that moment should be auto-joined, rather
-- than left stuck pending forever with no admin left who'd ever need to
-- decide it (an open club has no approval step at all going forward).
--
-- Implemented as a trigger on clubs, not app-layer/RPC code, matching
-- this app's established pattern for membership side effects reacting
-- to a state change (0041's handle_admin_role_membership_sync is the
-- closest precedent: promoting/demoting a club_members row auto-syncs
-- race/Eboard membership via trigger, not client code). This also means
-- the behavior holds regardless of which future call site ever updates
-- clubs.join_policy, not just today's edit screen.
--
-- Mirrors decide_join_request's approval branch (0035) as closely as
-- possible: same skip_add_notify guard so log_member_added's own
-- "added by" chat/notification doesn't fire redundantly alongside this,
-- same "request_approved" notification wording, same resolving of the
-- original pending admin-inbox notification (tagged resolved_outcome,
-- marked read) rather than deleting it — just looped over every pending
-- request for the club instead of one request_id passed in explicitly.
-- actor_id is auth.uid() of whoever performed the clubs UPDATE (the
-- admin who flipped the toggle) — RLS's "admins can update their club"
-- policy already guarantees that's a real admin/owner by the time this
-- trigger runs.

create or replace function public.handle_club_join_policy_opened()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  req record;
  actor_id uuid := auth.uid();
  actor_name text;
begin
  select full_name into actor_name from public.profiles where id = actor_id;

  for req in
    select * from public.club_join_requests
    where club_id = new.id and status = 'pending'
  loop
    perform set_config('clubchat.skip_add_notify', 'true', true);

    update public.club_join_requests
    set status = 'approved', decided_at = now(), decided_by = actor_id
    where id = req.id;

    insert into public.club_members (club_id, user_id, role)
    values (new.id, req.user_id, 'member')
    on conflict (club_id, user_id) do nothing;

    update public.notifications
    set resolved_outcome = 'approved',
        read_at = coalesce(read_at, now())
    where type = 'club_join_request'
      and target_path = '/clubs/' || new.id || '/club-profile/members'
      and public.notifications.actor_id = req.user_id;

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (
      req.user_id, actor_id, new.id, 'request_approved',
      'Your request to join ' || coalesce(new.name, 'a club') || ' was approved by ' || coalesce(actor_name, 'an admin'),
      '/clubs/' || new.id
    );
  end loop;

  return new;
end;
$$;

create trigger on_club_join_policy_opened
  after update of join_policy on public.clubs
  for each row
  when (new.join_policy = 'open' and old.join_policy is distinct from new.join_policy)
  execute function public.handle_club_join_policy_opened();
