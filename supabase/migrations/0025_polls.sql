-- Polls: club-admin-created polls with single- or multi-select voting,
-- and a per-poll public/private toggle for voter visibility. Its own
-- "Polls" hub row (not a chat message type), same structural shape as
-- races/routines. See SPEC.md's Polls task for the full design writeup.

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  question text not null,
  allow_multiple boolean not null default false,
  is_private boolean not null default false,
  is_closed boolean not null default false,
  created_at timestamptz not null default now()
);

-- vote_count is denormalized here (maintained by a trigger on
-- poll_votes below) so counts stay public and accurate even on a
-- private poll, where the individual poll_votes rows are RLS-hidden
-- from everyone but the creator and the voter themselves. RLS is
-- row-level, not column-level, so there's no way to expose "count" but
-- hide "who" from the same row — a denormalized counter on a row every
-- club member can already read (same as the option text) sidesteps that.
create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  text text not null,
  position int not null,
  vote_count int not null default 0
);

create table public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (option_id, user_id)
);

-- Helper functions (security-definer, same reasoning as is_race_admin /
-- is_channel_member in 0016_races.sql — a security-definer function
-- reading the table its own policy is attached to is already
-- precedented there, e.g. is_channel_member used in channels' own
-- SELECT policy, so this isn't a new pattern for this codebase).

create function public.can_access_poll(p_poll_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_club_member(club_id) from public.polls where id = p_poll_id;
$$;

create function public.is_poll_creator(p_poll_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select created_by = auth.uid() from public.polls where id = p_poll_id;
$$;

create function public.is_poll_private(p_poll_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select is_private from public.polls where id = p_poll_id;
$$;

create function public.is_poll_closed(p_poll_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select is_closed from public.polls where id = p_poll_id;
$$;

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- polls: visible to every club member; only club admins can create one
-- (creator recorded so update/delete can be restricted to them, mirroring
-- eboard_meetings' creator-only edit/delete rather than races'/routines'
-- any-admin pattern — a deliberate founder choice for polls). No
-- INSERT...RETURNING chicken-and-egg here (see SPEC.md section 6):
-- is_club_member(club_id) is already true independent of anything a
-- trigger creates afterward.
create policy "club members can read polls"
  on public.polls for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "admins can create polls"
  on public.polls for insert
  to authenticated
  with check (public.is_club_admin(club_id) and created_by = auth.uid());

create policy "creator can update their poll"
  on public.polls for update
  to authenticated
  using (public.is_poll_creator(id))
  with check (public.is_poll_creator(id));

create policy "creator can delete their poll"
  on public.polls for delete
  to authenticated
  using (public.is_poll_creator(id));

-- poll_options: readable by anyone who can read the poll; only ever
-- inserted once, right alongside the poll row, by its creator. Not
-- editable afterward (not requested — keeps this simple), so no
-- update/delete policy exists for this table at all.
create policy "club members can read poll options"
  on public.poll_options for select
  to authenticated
  using (public.can_access_poll(poll_id));

create policy "creator can add poll options"
  on public.poll_options for insert
  to authenticated
  with check (public.is_poll_creator(poll_id));

-- poll_votes: a voter always sees their own vote regardless of privacy
-- (needed so the UI can render "you voted for this" even on a private
-- poll), the creator sees every vote on their own poll, and everyone
-- sees everyone's on a public poll. This is the row-level piece that
-- pairs with poll_options.vote_count above: identity is gated here,
-- counts are not.
create policy "votes visible per poll privacy"
  on public.poll_votes for select
  to authenticated
  using (
    public.can_access_poll(poll_id)
    and (user_id = auth.uid() or public.is_poll_creator(poll_id) or not public.is_poll_private(poll_id))
  );

create policy "members can cast their own vote"
  on public.poll_votes for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_access_poll(poll_id) and not public.is_poll_closed(poll_id));

create policy "members can retract their own vote"
  on public.poll_votes for delete
  to authenticated
  using (user_id = auth.uid() and not public.is_poll_closed(poll_id));

-- Keeps poll_options.vote_count in sync with poll_votes without the app
-- ever needing to compute an aggregate itself (which would require
-- reading poll_votes rows that may be RLS-hidden from the caller).
create function public.update_poll_option_vote_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.poll_options set vote_count = vote_count + 1 where id = new.option_id;
  elsif tg_op = 'DELETE' then
    update public.poll_options set vote_count = vote_count - 1 where id = old.option_id;
  end if;
  return null;
end;
$$;

create trigger on_poll_vote_added
  after insert on public.poll_votes
  for each row execute function public.update_poll_option_vote_count();

create trigger on_poll_vote_removed
  after delete on public.poll_votes
  for each row execute function public.update_poll_option_vote_count();

-- Casts (or toggles/moves) the caller's vote. Deliberately plain
-- security-invoker plpgsql, not security-definer: it only ever touches
-- the calling user's own poll_votes rows, so ordinary RLS (above) is
-- sufficient and safer than bypassing it. It also never does
-- INSERT...RETURNING, so it can't hit the RETURNING-also-checks-the-
-- SELECT-policy trap documented in SPEC.md section 6.
create function public.cast_vote(p_option_id uuid)
returns void
language plpgsql
as $$
declare
  v_poll_id uuid;
  v_allow_multiple boolean;
  v_closed boolean;
  v_deleted uuid;
begin
  select po.poll_id, p.allow_multiple, p.is_closed
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
