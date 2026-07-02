-- Additional optional profile fields shown on the profile view/edit
-- screens and on a member's read-only profile card.
alter table public.profiles
  add column city text not null default '',
  add column date_of_birth date,
  add column school text not null default '';
