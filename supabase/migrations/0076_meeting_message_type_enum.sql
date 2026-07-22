-- New message_type value for Eboard meeting chat cards (same treatment
-- as 'poll'/'event' in 0069) — alone in its own file per the
-- enum-transaction lesson in SPEC.md section 6 (a freshly-added value
-- can't be used in the same transaction it was created in).
alter type public.message_type add value 'meeting';
