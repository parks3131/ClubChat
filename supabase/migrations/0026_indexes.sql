-- Missing indexes on foreign-key columns that are filtered on directly
-- (.eq(...)) but aren't already covered by a primary key or unique
-- constraint on the same leading column. See SPEC.md task #27.

create index if not exists races_club_id_idx on public.races (club_id);

create index if not exists eboard_meetings_eboard_channel_id_idx
  on public.eboard_meetings (eboard_channel_id);

create index if not exists race_car_groups_race_id_idx
  on public.race_car_groups (race_id);

create index if not exists polls_club_id_idx on public.polls (club_id);

create index if not exists poll_options_poll_id_idx
  on public.poll_options (poll_id);

create index if not exists poll_votes_poll_id_user_id_idx
  on public.poll_votes (poll_id, user_id);
