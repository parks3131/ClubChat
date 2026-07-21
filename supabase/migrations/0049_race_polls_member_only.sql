-- Founder request: race-scoped polls should follow the exact same
-- access model Eboard polls already use — visible (and creatable) only
-- to actual participants (a real race_members row), never automatically
-- to a club Admin/Owner who hasn't joined that race. Previously
-- `is_race_admin(race_id) OR is_race_member(race_id)` let a club
-- manager see/create a race's polls without ever being on its roster —
-- a deliberate carry-over from task #16/#38, but the founder now wants
-- race polls to require the same real membership chat access already
-- requires (`is_channel_member`'s race branch, task #44).
--
-- Every place this rule is enforced changes together, or the app breaks
-- in the exact way SPEC.md section 6 already warns about: `can_access_poll`
-- backs poll_options/poll_votes' RLS too (no separate edits needed
-- there — that's the whole payoff of routing through one shared
-- function), and the polls INSERT policy's WITH CHECK must imply the
-- new SELECT policy (is_race_member), or a manager who isn't a member
-- could still INSERT a poll and then fail on the RETURNING re-check of
-- SELECT (the section 6 "INSERT...RETURNING also enforces SELECT"
-- gotcha, hit for real once already in this exact table during task
-- #38). Creation eligibility itself deliberately stays narrower than
-- "any member" — see the policy below.

create or replace function public.can_access_poll(p_poll_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case
    when p.race_id is not null then public.is_race_member(p.race_id)
    when p.eboard_channel_id is not null then public.is_eboard_member(p.eboard_channel_id)
    else public.is_club_member(p.club_id)
  end
  from public.polls p where p.id = p_poll_id;
$$;

drop policy "eligible members can read polls" on public.polls;
create policy "eligible members can read polls"
  on public.polls for select
  to authenticated
  using (
    case
      when race_id is not null then is_race_member(race_id)
      when eboard_channel_id is not null then is_eboard_member(eboard_channel_id)
      else is_club_member(club_id)
    end
  );

-- Race branch: is_race_member(race_id) AND is_race_admin(race_id), not
-- just membership — mirrors is_channel_admin's exact race-branch shape
-- (which gates pin/announce the same way: "is_race_member and
-- is_race_admin"), so poll creation stays management-only, just now
-- additionally requiring the manager has actually joined the race. This
-- deliberately does NOT open poll creation to every race participant —
-- only the "no membership required" loophole is closed, not the
-- existing admin-only creation rule.
drop policy "eligible members can create polls" on public.polls;
create policy "eligible members can create polls"
  on public.polls for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and case
      when race_id is not null then is_race_member(race_id) and is_race_admin(race_id)
      when eboard_channel_id is not null then is_eboard_member(eboard_channel_id)
      else is_club_admin(club_id)
    end
  );

-- notify_poll_created's race branch previously unioned in club admins
-- alongside race_members — now that a non-member manager can neither see
-- nor create a race poll, notifying them about one would just be a dead
-- link. Audience narrows to race_members only, matching the new access
-- model exactly (mirrors the eboard branch's shape, which was already
-- member-only).
create or replace function public.notify_poll_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  club_name text;
  race_row public.races;
  scope_name text;
begin
  select name into club_name from public.clubs where id = new.club_id;

  if new.race_id is not null then
    select * into race_row from public.races where id = new.race_id;
    scope_name := coalesce(race_row.name, 'a race');

    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select rm.user_id, new.created_by, new.club_id, 'poll_created'::notification_type,
      'New poll in ' || scope_name || ': ' || new.question,
      '/clubs/' || new.club_id || '/race/' || new.race_id || '/polls/' || new.id
    from public.race_members rm
    where rm.race_id = new.race_id and rm.user_id <> new.created_by;

  elsif new.eboard_channel_id is not null then
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select ecm.user_id, new.created_by, new.club_id, 'poll_created'::notification_type,
      'New poll in the Eboard: ' || new.question,
      '/clubs/' || new.club_id || '/eboard/polls/' || new.id
    from public.eboard_channel_members ecm
    where ecm.eboard_channel_id = new.eboard_channel_id and ecm.user_id <> new.created_by;

  else
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
    select
      cm.user_id, new.created_by, new.club_id, 'poll_created'::notification_type,
      'New poll in ' || coalesce(club_name, 'your club') || ': ' || new.question,
      '/clubs/' || new.club_id || '/polls/' || new.id
    from public.club_members cm
    where cm.club_id = new.club_id and cm.user_id <> new.created_by;
  end if;

  return new;
end;
$$;

-- notify_polls_closing_soon (0048, this same feature's own migration
-- last time) had the identical union — same fix, same reasoning.
create or replace function public.notify_polls_closing_soon()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  poll_row public.polls;
  club_name text;
  race_row public.races;
  scope_name text;
begin
  for poll_row in
    select * from public.polls
    where closes_at is not null
      and not is_closed
      and closing_soon_notified_at is null
      and closes_at > now()
      and closes_at <= now() + interval '10 minutes'
  loop
    if poll_row.race_id is not null then
      select * into race_row from public.races where id = poll_row.race_id;
      scope_name := coalesce(race_row.name, 'a race');

      insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
      select rm.user_id, poll_row.created_by, poll_row.club_id, 'poll_closing_soon'::notification_type,
        'Poll closing soon in ' || scope_name || ': ' || poll_row.question,
        '/clubs/' || poll_row.club_id || '/race/' || poll_row.race_id || '/polls/' || poll_row.id
      from public.race_members rm
      where rm.race_id = poll_row.race_id;

    elsif poll_row.eboard_channel_id is not null then
      insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
      select ecm.user_id, poll_row.created_by, poll_row.club_id, 'poll_closing_soon'::notification_type,
        'Poll closing soon in the Eboard: ' || poll_row.question,
        '/clubs/' || poll_row.club_id || '/eboard/polls/' || poll_row.id
      from public.eboard_channel_members ecm
      where ecm.eboard_channel_id = poll_row.eboard_channel_id;

    else
      select name into club_name from public.clubs where id = poll_row.club_id;

      insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
      select cm.user_id, poll_row.created_by, poll_row.club_id, 'poll_closing_soon'::notification_type,
        'Poll closing soon in ' || coalesce(club_name, 'your club') || ': ' || poll_row.question,
        '/clubs/' || poll_row.club_id || '/polls/' || poll_row.id
      from public.club_members cm
      where cm.club_id = poll_row.club_id;
    end if;

    update public.polls set closing_soon_notified_at = now() where id = poll_row.id;
  end loop;
end;
$$;
