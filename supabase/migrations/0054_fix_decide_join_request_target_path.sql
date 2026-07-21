-- Real bug found while building 0053's auto-approve trigger: decide_join_request
-- (last touched by 0035_notifications_persistent_requests.sql) resolves the
-- original "X wants to join" admin-inbox notification by matching its
-- target_path, but 0046_fix_club_join_request_target_path.sql later changed
-- what notify_club_join_request actually inserts (from
-- '/clubs/{clubId}/club-profile' to '/clubs/{clubId}/club-profile/members',
-- since club-profile/index.tsx had by then split into an identity-only
-- index.tsx + members.tsx) without re-creating decide_join_request to match.
-- Ever since 0046, approving/denying a club join request via decide_join_request
-- silently fails to find the notification it's supposed to resolve — the
-- request itself still gets approved/denied correctly, but the original
-- notification is left permanently unresolved: no "Approved"/"Denied" tag,
-- never marked read, forever counted in that admin's unread badge.
--
-- decide_race_join_request and decide_eboard_join_request checked for the
-- same drift and are unaffected — 0046 only touched the club branch's
-- insert path, race/eboard's own notify_*_join_request paths never changed
-- after 0033, so those two decide_* functions still match correctly.
--
-- Fixed by re-creating decide_join_request unchanged except for the one
-- target_path literal, same technique 0036/0038/0043/0048/0050 already used.

create or replace function public.decide_join_request(request_id uuid, approve boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  req public.club_join_requests;
  actor_id uuid := auth.uid();
  actor_name text;
  club_name text;
begin
  select * into req from public.club_join_requests where id = request_id;
  if req.id is null then
    raise exception 'Request not found';
  end if;
  if not public.is_club_admin(req.club_id) then
    raise exception 'Not authorized';
  end if;

  update public.club_join_requests
  set status = case when approve then 'approved' else 'denied' end,
      decided_at = now(),
      decided_by = actor_id
  where id = request_id;

  select full_name into actor_name from public.profiles where id = actor_id;
  select name into club_name from public.clubs where id = req.club_id;

  update public.notifications
  set resolved_outcome = case when approve then 'approved' else 'denied' end,
      read_at = coalesce(read_at, now())
  where type = 'club_join_request'
    and target_path = '/clubs/' || req.club_id || '/club-profile/members'
    and public.notifications.actor_id = req.user_id;

  if approve then
    perform set_config('clubchat.skip_add_notify', 'true', true);

    insert into public.club_members (club_id, user_id, role)
    values (req.club_id, req.user_id, 'member')
    on conflict (club_id, user_id) do nothing;

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (
      req.user_id, actor_id, req.club_id, 'request_approved',
      'Your request to join ' || coalesce(club_name, 'a club') || ' was approved by ' || coalesce(actor_name, 'an admin'),
      '/clubs/' || req.club_id
    );
  else
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    values (
      req.user_id, actor_id, req.club_id, 'request_denied',
      'Your request to join ' || coalesce(club_name, 'a club') || ' was denied by ' || coalesce(actor_name, 'an admin'),
      '/clubs'
    );
  end if;
end;
$$;
