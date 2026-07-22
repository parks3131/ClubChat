-- New message_type values for poll/event chat cards (founder wireframe:
-- a created poll/event auto-posts into club chat as a rich, votable/
-- linkable card, not just a plain notification). Both added in one file
-- since neither is referenced within this same migration — the
-- same-transaction restriction (SPEC.md section 6) only bites when a
-- freshly-added value is *used* before the transaction commits.
alter type public.message_type add value 'poll';
alter type public.message_type add value 'event';
