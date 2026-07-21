-- Split into its own migration for the same reason
-- 0042_club_role_owner_enum.sql was: `alter type ... add value` can't be
-- used later in the same transaction when the enum type already existed
-- before that transaction started, and `supabase db reset` runs each
-- migration file as one transaction. notification_type has existed since
-- 0031 — nothing else in this file may reference 'poll_closing_soon'.

alter type public.notification_type add value 'poll_closing_soon';
