-- Redesign of @mention tagging (task: mention_tagging), replacing 0055-0057.
--
-- Founder-reported bug in the first version: mentions were embedded as a
-- `@[Full Name](userId)` token directly in the composer's draft text, which
-- meant the *raw markup itself* was visible while still typing (only the
-- already-sent bubble stripped it back down to a clean "@Name" via
-- lib/mentions.ts's parseMessageBody). A plain RN TextInput can't render
-- part of its own value in a different style, so there was no way to keep
-- the composer WYSIWYG while still embedding parseable markup in the same
-- string the user was editing.
--
-- Fix: stop embedding anything in body at all. The composer now inserts
-- plain "@Full Name" text (exactly what the user sees, always), and which
-- users were mentioned is tracked as its own side table — same shape as
-- message_reactions/message_reports, not a new concept for this codebase.
-- Rendering highlights any "@FullName" substring the client already knows
-- (from this table) is a real mention; the notification trigger (0059)
-- reads this table directly instead of parsing body.
create table public.message_mentions (
  message_id uuid not null references public.messages (id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, mentioned_user_id)
);

alter table public.message_mentions enable row level security;

-- Mirrors message_reactions' own two policies (0003_rls.sql) exactly.
create policy "members can read message mentions"
  on public.message_mentions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_channel_member(m.channel_id)
    )
  );

create policy "sender can tag mentions on their own message"
  on public.message_mentions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = auth.uid()
    )
  );
