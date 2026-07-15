-- Eboard had insert/select policies on eboard_channel_members since
-- 0017_eboard.sql but no delete policy at all — same class of gap as
-- 0037_race_members_delete.sql. Removal rights belong to existing eboard
-- members (mirrors the insert/decide-request policies, NOT is_club_admin —
-- being a club admin alone does not imply eboard access here, per
-- 0017's own note). Self-removal is blocked at the RLS layer itself
-- (user_id <> auth.uid()), not just hidden in the UI, matching this
-- project's precedent of verifying destructive RLS at the policy level
-- (see task #24's creator-only close/delete verification).
create policy "eboard members can remove other members"
  on public.eboard_channel_members for delete
  to authenticated
  using (public.is_eboard_member(eboard_channel_id) and user_id <> auth.uid());
