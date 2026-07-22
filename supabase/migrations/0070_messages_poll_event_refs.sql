-- A poll/event chat message carries a reference to the real row instead
-- of duplicating its content — on delete cascade means deleting the poll
-- or event also removes its chat card, rather than leaving a dead link.
alter table public.messages add column poll_id uuid references public.polls (id) on delete cascade;
alter table public.messages add column event_id uuid references public.calendar_events (id) on delete cascade;
