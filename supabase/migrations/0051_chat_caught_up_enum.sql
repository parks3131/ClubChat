-- Split into its own migration for the same reason 0042/0047 were:
-- `alter type ... add value` can't be used later in the same
-- transaction when the enum type already existed before that
-- transaction started. notification_type has existed since 0031.

alter type public.notification_type add value 'chat_caught_up';
