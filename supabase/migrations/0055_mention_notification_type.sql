-- New notification_type value for @mention tagging (task: mention_tagging).
-- Alone in its own file: `alter type ... add value` can't be used later in
-- the same transaction the enum type was created/altered in — see
-- SPEC.md section 6 / 0047_poll_closing_soon_enum.sql /
-- 0051_chat_caught_up_enum.sql for the same split.

alter type public.notification_type add value 'mentioned';
