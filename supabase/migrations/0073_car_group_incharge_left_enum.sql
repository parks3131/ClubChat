-- Split into its own migration for the same reason 0042/0047/0051/0064/
-- 0066 were: `alter type ... add value` can't be used later in the same
-- transaction when the enum type already existed before that transaction
-- started, and `supabase db reset` runs each migration file as one
-- transaction. notification_type has existed since 0031 — nothing else in
-- this file may reference 'car_group_incharge_left'.

alter type public.notification_type add value 'car_group_incharge_left';
