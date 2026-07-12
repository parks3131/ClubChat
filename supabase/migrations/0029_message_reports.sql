-- Chat moderation: report a message (task: chat moderation). Message
-- delete already worked at the RLS layer before this migration — see
-- 0003_rls.sql's "sender or admin can delete a message" policy — this
-- adds the missing half: a way to flag content to admins, satisfying
-- Apple Guideline 1.2 (User-Generated Content)'s report requirement.
--
-- Scope, per an explicit founder call: report + delete only, no "block a
-- user" feature — ambiguous in a shared-membership chat (you can't
-- meaningfully block one member of a club chat you both still belong
-- to), and admin message-delete/member-removal already covers real abuse
-- cases.
--
-- channel_id is denormalized onto this table (same reasoning as
-- race_car_group_members.race_id in 0021_race_car_groups.sql: it isn't
-- needed for the FK graph, but it lets the admin-facing "reports in this
-- channel" query filter directly instead of joining through messages,
-- and lets the RLS policies use is_channel_admin/is_channel_member
-- without a subquery). The insert policy still cross-checks it actually
-- matches the message's real channel_id, so a client can't lie about it.
create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);

alter table public.message_reports enable row level security;

create policy "channel members can report a message"
  on public.message_reports for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and public.is_channel_member(channel_id)
    and exists (
      select 1 from public.messages m
      where m.id = message_id and m.channel_id = message_reports.channel_id
    )
  );

create policy "channel admins can view reports"
  on public.message_reports for select
  to authenticated
  using (public.is_channel_admin(channel_id));

create policy "channel admins can dismiss a report"
  on public.message_reports for delete
  to authenticated
  using (public.is_channel_admin(channel_id));

create index on public.message_reports (channel_id);
create index on public.message_reports (message_id);
