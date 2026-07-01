-- Row-level security. Membership checks are security-definer functions
-- (not inline subqueries on club_members) to avoid RLS self-recursion.

create function public.is_club_member(p_club_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = auth.uid()
  );
$$;

create function public.is_club_admin(p_club_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = auth.uid() and role = 'admin'
  );
$$;

create function public.is_channel_member(p_channel_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_club_member(club_id) from public.channels where id = p_channel_id;
$$;

create function public.is_channel_admin(p_channel_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_club_admin(club_id) from public.channels where id = p_channel_id;
$$;

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.calendar_events enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;

-- profiles: readable by any signed-in user (needed to show names/avatars
-- in rosters and chat); writable only by the owner.
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- clubs
-- created_by = auth.uid() lets the creator see the row via INSERT ...
-- RETURNING immediately, before the on_club_created trigger has inserted
-- their club_members admin row (INSERT RETURNING is re-checked against
-- the SELECT policy, and is_club_member() would still be false at that
-- exact instant otherwise).
create policy "members can read their clubs"
  on public.clubs for select
  to authenticated
  using (public.is_club_member(id) or created_by = auth.uid());

create policy "authenticated users can create clubs"
  on public.clubs for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "admins can update their club"
  on public.clubs for update
  to authenticated
  using (public.is_club_admin(id))
  with check (public.is_club_admin(id));

-- club_members
create policy "members can see their club roster"
  on public.club_members for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "admins can add members"
  on public.club_members for insert
  to authenticated
  with check (public.is_club_admin(club_id));

create policy "admins can change member roles"
  on public.club_members for update
  to authenticated
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

create policy "admins can remove members, members can leave"
  on public.club_members for delete
  to authenticated
  using (public.is_club_admin(club_id) or user_id = auth.uid());

-- calendar_events
create policy "members can read club calendar"
  on public.calendar_events for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "admins can create calendar events"
  on public.calendar_events for insert
  to authenticated
  with check (public.is_club_admin(club_id));

create policy "admins can update calendar events"
  on public.calendar_events for update
  to authenticated
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

create policy "admins can delete calendar events"
  on public.calendar_events for delete
  to authenticated
  using (public.is_club_admin(club_id));

-- channels (created by trigger only; members can just read)
create policy "members can read their club channel"
  on public.channels for select
  to authenticated
  using (public.is_club_member(club_id));

-- messages
create policy "members can read channel messages"
  on public.messages for select
  to authenticated
  using (public.is_channel_member(channel_id));

create policy "members can send messages, only admins can announce"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_channel_member(channel_id)
    and (message_type <> 'announcement' or public.is_channel_admin(channel_id))
  );

create policy "sender or admin can edit a message"
  on public.messages for update
  to authenticated
  using (sender_id = auth.uid() or public.is_channel_admin(channel_id))
  with check (sender_id = auth.uid() or public.is_channel_admin(channel_id));

create policy "sender or admin can delete a message"
  on public.messages for delete
  to authenticated
  using (sender_id = auth.uid() or public.is_channel_admin(channel_id));

-- message_reactions
create policy "members can read reactions"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_channel_member(m.channel_id)
    )
  );

create policy "members can react to messages in their channel"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_channel_member(m.channel_id)
    )
  );

create policy "users can remove their own reaction"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());
