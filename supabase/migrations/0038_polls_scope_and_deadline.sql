-- Generalizes polls beyond club-only to also be creatable inside a Race or
-- inside Eboard & Council, and adds an optional deadline. Same pattern
-- channels/eboard_meetings/notifications already established: nullable
-- race_id/eboard_channel_id columns on the existing table rather than a
-- new table per scope, club_id stays not null and denormalized on every
-- row regardless of scope (confirmed against channels' own shape in
-- 0001_init.sql/0016_races.sql/0017_eboard.sql before writing this).

alter table public.polls add column closes_at timestamptz null;
alter table public.polls add column race_id uuid references public.races (id) on delete cascade;
alter table public.polls add column eboard_channel_id uuid references public.eboard_channels (id) on delete cascade;

create index polls_race_id_idx on public.polls (race_id);
create index polls_eboard_channel_id_idx on public.polls (eboard_channel_id);

-- can_access_poll becomes a 3-way branch, same shape as is_channel_member
-- (0017_eboard.sql) — a security-definer function reading its own table
-- from inside that table's own RLS policy is already proven safe in this
-- codebase (is_channel_member used inside channels' own SELECT policy).
create or replace function public.can_access_poll(p_poll_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case
    when p.race_id is not null then public.is_race_admin(p.race_id) or public.is_race_member(p.race_id)
    when p.eboard_channel_id is not null then public.is_eboard_member(p.eboard_channel_id)
    else public.is_club_member(p.club_id)
  end
  from public.polls p where p.id = p_poll_id;
$$;

-- is_poll_closed now also accounts for a passed deadline, computed live —
-- no cron/background job, matching how this app avoids scheduled jobs
-- everywhere else. This alone extends enforcement everywhere it's already
-- referenced (poll_votes insert/delete RLS policies) with no other policy
-- edits needed.
create or replace function public.is_poll_closed(p_poll_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select is_closed or (closes_at is not null and closes_at < now())
  from public.polls where id = p_poll_id;
$$;

-- polls' own SELECT policy needs the same 3-way branch so a race/Eboard-
-- scoped poll is readable by that scope's own audience instead of every
-- club member — but, unlike poll_options/poll_votes below, it is written
-- INLINE on the row's own columns rather than by calling can_access_poll
-- (which re-queries polls by id). A first attempt used
-- `using (can_access_poll(id))` here and hit a real, freshly-discovered
-- variant of SPEC.md section 6's INSERT...RETURNING gotcha: a plain
-- `INSERT ... ` succeeded, but the exact same insert through
-- supabase-js's `.insert().select()` (== INSERT...RETURNING) failed with
-- "new row violates row-level security policy", even though a manual
-- SELECT run immediately afterward confirmed can_access_poll(id) was true
-- for that row. Root cause, confirmed by reproducing both the failure and
-- the fix directly in psql (impersonating the caller via
-- `set local role authenticated` + `request.jwt.claims`): the ORIGINAL
-- policy (`is_club_member(club_id)`) evaluated a column bound straight
-- off the tuple being returned, with no further lookup. Routing it
-- through can_access_poll(id) instead makes the SELECT-policy check
-- re-query polls BY ID from inside a security-definer function during
-- the same RETURNING evaluation that's still producing that very row —
-- a self-referential subquery back into the table being inserted into,
-- which is a materially riskier shape than the "is_channel_member used
-- inside channels' own SELECT policy" precedent this was modeled on
-- (that precedent has never actually been exercised through a client
-- `.insert().select()` in this codebase — every channels row is inserted
-- server-side by a trigger, not returned to a caller). Fix: keep the
-- branch inline, bound directly to the row's own race_id/eboard_channel_id/
-- club_id, exactly like the original working policy did — no subquery
-- back into polls itself.
drop policy "club members can read polls" on public.polls;
create policy "eligible members can read polls"
  on public.polls for select
  to authenticated
  using (
    case
      when race_id is not null then public.is_race_admin(race_id) or public.is_race_member(race_id)
      when eboard_channel_id is not null then public.is_eboard_member(eboard_channel_id)
      else public.is_club_member(club_id)
    end
  );

-- INSERT policy becomes a 3-way branch matching each scope's own existing
-- management pattern: any club admin in a Race (mirrors every other race-
-- management action — car groups, meet info), any Eboard member in Eboard
-- (mirrors Eboard Meetings' own "any member can create" rule), club admin
-- for a plain club poll (unchanged from today). This half (the INSERT
-- WITH CHECK itself) has no chicken-and-egg risk — in every branch the
-- creator's eligibility is already true at insert time. The SELECT
-- policy this insert's RETURNING clause re-checks is a separate story;
-- see the long comment above it.
drop policy "admins can create polls" on public.polls;
create policy "eligible members can create polls"
  on public.polls for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and case
      when race_id is not null then public.is_race_admin(race_id)
      when eboard_channel_id is not null then public.is_eboard_member(eboard_channel_id)
      else public.is_club_admin(club_id)
    end
  );

-- Update/delete policies (creator-only) are untouched — creator-only
-- already, and stays creator-only in every scope per the founder's
-- explicit choice when this was planned.

-- cast_vote reads p.is_closed directly rather than calling the helper
-- above, so it needs the same deadline check added inline.
create or replace function public.cast_vote(p_option_id uuid)
returns void
language plpgsql
as $$
declare
  v_poll_id uuid;
  v_allow_multiple boolean;
  v_closed boolean;
  v_deleted uuid;
begin
  select po.poll_id, p.allow_multiple, (p.is_closed or (p.closes_at is not null and p.closes_at < now()))
    into v_poll_id, v_allow_multiple, v_closed
    from public.poll_options po
    join public.polls p on p.id = po.poll_id
    where po.id = p_option_id;

  if v_poll_id is null then
    raise exception 'Option not found';
  end if;
  if v_closed then
    raise exception 'This poll is closed';
  end if;

  delete from public.poll_votes
    where option_id = p_option_id and user_id = auth.uid()
    returning option_id into v_deleted;

  if v_deleted is not null then
    return;
  end if;

  if not v_allow_multiple then
    delete from public.poll_votes where poll_id = v_poll_id and user_id = auth.uid();
  end if;

  insert into public.poll_votes (poll_id, option_id, user_id)
  values (v_poll_id, p_option_id, auth.uid());
end;
$$;

-- notify_poll_created (task #35, 0034_notification_triggers_creation.sql)
-- unconditionally fanned out to every club_members row regardless of
-- scope — harmless while polls were club-only, but now that a poll can be
-- Eboard- or race-scoped this would leak an Eboard poll's question to the
-- entire club (a real privacy violation of Eboard's whole access model)
-- and over-notify a race poll to non-participants. Re-created with the
-- same 3-way branch/audience shape as notify_announcement (0034, fixed
-- for a similar race-branch bug in 0036_fix_announcement_notify_race_cast.sql)
-- — including the same explicit `::notification_type` cast on the race
-- branch's literal, caught live the same way 0036's bug was: this
-- function's own race branch uses `select distinct ... from (... union
-- ...)`, which forces the 'poll_created' literal to resolve as `text`
-- before it ever reaches the notifications.type column, defeating the
-- implicit unknown-literal-to-enum cast Postgres normally does on
-- INSERT...SELECT. Recorded here again because it's the same mistake
-- repeating in new code within the very same session — worth a second,
-- explicit callout.
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
    select distinct u.user_id, new.created_by, new.club_id, 'poll_created'::notification_type,
      'New poll in ' || scope_name || ': ' || new.question,
      '/clubs/' || new.club_id || '/race/' || new.race_id || '/polls/' || new.id
    from (
      select user_id from public.race_members where race_id = new.race_id
      union
      select user_id from public.club_members where club_id = new.club_id and role = 'admin'
    ) u
    where u.user_id <> new.created_by;

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
