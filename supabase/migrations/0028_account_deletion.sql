-- Self-service account deletion (Apple 5.1.1(v) / Google Play requirement).
--
-- Chosen approach — explicit founder call, not a default: ANONYMIZE, not
-- hard-delete. This is a shared-chat app: a user's past messages and
-- created content (clubs/races/polls/routine workouts/eboard meetings/car
-- groups) are visible to other members, and profiles.id has no
-- `on delete` path wired up across the ~15 foreign keys that reference it
-- (messages.sender_id, clubs.created_by, polls.created_by, ...) — a hard
-- delete would either need a much larger migration touching all of them,
-- with real product calls buried in each one (should a poll still be
-- manageable once its creator is gone? does a sent message vanish or
-- show "Unknown"?), or fail outright the first time any user who ever
-- sent a message tried to delete their account. Anonymizing sidesteps
-- all of that: scrub PII from the profile row (the app's existing
-- "Unknown" sender/creator fallbacks, e.g. lib/messages.ts's
-- `?? "Unknown"`, already handle a generic display name), disable login,
-- one function, no schema surgery.
--
-- Disabling login needs `auth.users.banned_until`, which a normal
-- authenticated client can't write (auth schema, no RLS/grant exposes
-- it) — hence security definer, same pattern as
-- join_or_request_club/decide_join_request in 0006_join_requests.sql.
-- Functions created by migrations here are owned by `postgres`, which
-- has UPDATE on auth.users (confirmed against the actual running local
-- instance, not assumed).
--
-- Note: banned_until blocks future sign-in/token-refresh, but an
-- already-issued access token remains valid until it expires — the
-- client is expected to call supabase.auth.signOut() immediately after
-- this RPC returns, same inherent limitation any stateless-JWT ban has.
create or replace function public.delete_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set full_name = 'Deleted user',
      avatar_url = null,
      bio = '',
      city = '',
      date_of_birth = null,
      school = ''
  where id = auth.uid();

  update auth.users
  set banned_until = now() + interval '100 years'
  where id = auth.uid();
end;
$$;

grant execute on function public.delete_account() to authenticated;
