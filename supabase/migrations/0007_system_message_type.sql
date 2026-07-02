-- 'system' message type for membership-change chat events ("X joined",
-- "X was added by Y", "X left", "X was removed by Y"). Added as its own
-- migration because a new enum value can't be referenced until the
-- transaction that added it has committed — the trigger functions that
-- use it live in the next migration.
alter type public.message_type add value 'system';
