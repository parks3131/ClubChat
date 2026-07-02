-- Free-text bio/description for the profile page.
alter table public.profiles
  add column bio text not null default '';
