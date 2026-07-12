-- Soft-delete messages instead of hard-deleting them, so a deleted
-- message leaves a "This message was deleted" tombstone in place rather
-- than silently vanishing from other members' chat history mid-
-- conversation.
alter table public.messages add column deleted_at timestamptz;

-- No RLS change needed: soft-delete goes through the existing "sender or
-- admin can edit a message" UPDATE policy (0003_rls.sql) — deleting is
-- just another edit (clearing body/media_url, setting deleted_at), not
-- the DELETE policy. The DELETE policy is left in place unused rather
-- than dropped — the app no longer calls it, but dropping it isn't
-- needed for correctness.
