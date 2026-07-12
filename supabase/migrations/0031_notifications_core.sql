-- Notifications: a Strava-style cross-club inbox (SPEC.md's newest task).
-- Two things needed from scratch, since neither exists anywhere in the
-- schema today (confirmed via a repo-wide grep for read/unread before
-- writing this): a `notifications` table for discrete events (join
-- requests, membership changes, poll/event/race/meeting creation,
-- announcements), and a `channel_reads` table so a chat channel's
-- "N unread messages" can be computed at all.
--
-- `notifications` stores a literal `target_path` (an Expo Router route
-- string) rather than a pile of nullable per-type foreign keys — every
-- consumer of this table just does `router.push(target_path)`, so typed
-- FKs would only exist to be immediately flattened back into a string
-- by the client. `club_id` is kept as a real FK since every notification
-- is club-scoped and it's cheap insurance for any future filtering.

create type public.notification_type as enum (
  'club_join_request', 'race_join_request', 'eboard_join_request',
  'request_approved', 'request_denied',
  'member_added', 'member_removed', 'role_changed',
  'poll_created', 'event_created', 'race_created', 'meeting_created',
  'announcement'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  club_id uuid not null references public.clubs (id) on delete cascade,
  type public.notification_type not null,
  body text not null,
  target_path text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.notifications (recipient_id, read_at);

alter table public.notifications enable row level security;

-- No insert policy: every row is written by security-definer trigger
-- functions (0032-0034), the same pattern already used for system chat
-- messages — the trigger bypasses RLS, so a client-facing insert policy
-- would only be needed if the app ever inserted notifications directly,
-- which it deliberately never does.
create policy "recipients can read their own notifications"
  on public.notifications for select
  to authenticated
  using (recipient_id = auth.uid());

create policy "recipients can mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

alter publication supabase_realtime add table public.notifications;

-- Per-user, per-channel read cursor. Deliberately separate from
-- `notifications` — chat-unread counts are computed live from `messages`
-- + this cursor, not stored as discrete rows, so "N unread in Club X
-- chat" always reflects reality rather than needing to be kept in sync
-- with a stream of per-message notification rows.
create table public.channel_reads (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

alter table public.channel_reads enable row level security;

create policy "users manage their own read state"
  on public.channel_reads for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- One round trip for every channel the caller has unread messages in —
-- avoids an N+1 client-side loop over every club/race/eboard channel the
-- user belongs to. Reuses is_channel_member (already handles the
-- club/race/eboard branching, see 0017_eboard.sql) so channel access
-- logic isn't duplicated here.
create or replace function public.fetch_unread_channel_summaries()
returns table (
  channel_id uuid,
  club_id uuid,
  race_id uuid,
  eboard_channel_id uuid,
  channel_name text,
  unread_count bigint,
  last_message_at timestamptz
)
language sql
security definer set search_path = public
stable
as $$
  select
    c.id,
    c.club_id,
    c.race_id,
    c.eboard_channel_id,
    coalesce(r.name, eb.name, cl.name) as channel_name,
    count(m.id) filter (
      where m.created_at > coalesce(cr.last_read_at, 'epoch'::timestamptz)
        and m.sender_id <> auth.uid()
        and m.deleted_at is null
    ) as unread_count,
    max(m.created_at) as last_message_at
  from public.channels c
  join public.clubs cl on cl.id = c.club_id
  left join public.races r on r.id = c.race_id
  left join public.eboard_channels eb on eb.id = c.eboard_channel_id
  left join public.channel_reads cr on cr.channel_id = c.id and cr.user_id = auth.uid()
  left join public.messages m on m.channel_id = c.id
  where public.is_channel_member(c.id)
  group by c.id, c.club_id, c.race_id, c.eboard_channel_id, r.name, eb.name, cl.name
  having count(m.id) filter (
    where m.created_at > coalesce(cr.last_read_at, 'epoch'::timestamptz)
      and m.sender_id <> auth.uid()
      and m.deleted_at is null
  ) > 0;
$$;
