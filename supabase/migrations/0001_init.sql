-- ClubChat MVP schema: profiles, clubs, membership/roles, calendar events,
-- channels/messages/reactions. Race, carpool, routine, and poll tables land
-- in later migrations alongside their own features.

create extension if not exists "pgcrypto";

-- One row per auth.users, holds app-facing profile data.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sport text,
  invite_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 8),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create type public.club_role as enum ('admin', 'member');

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.club_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create type public.calendar_event_type as enum ('race', 'practice', 'team_bonding', 'volunteer', 'other');

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  event_type public.calendar_event_type not null default 'other',
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- A channel is the general club chat today; race_id (nullable) will be
-- added in the race migration so race sub-chats reuse this same table.
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id)
);

create type public.message_type as enum ('text', 'photo', 'announcement');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  message_type public.message_type not null default 'text',
  body text,
  media_url text,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index on public.club_members (user_id);
create index on public.calendar_events (club_id, start_at);
create index on public.messages (channel_id, created_at);
