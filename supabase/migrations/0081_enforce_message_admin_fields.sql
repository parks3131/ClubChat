-- R3: a member could pin their own message and fake an announcement.
--
-- The messages UPDATE policy is `sender_id = auth.uid() or is_channel_admin(...)`
-- with no column restriction, because that same policy legitimately carries a
-- sender's own body edits and soft-deletes. So a plain member could
-- `update messages set pinned = true` on their own message (surfacing it in the
-- channel's Pinned strip and Highlights), or retro-flip `message_type` to
-- 'announcement' so it renders as one. The admin check on announcements lived
-- only in the INSERT policy and was never re-applied on UPDATE.
--
-- A policy split can't fix this without also losing the sender's legitimate
-- body-edit / soft-delete rights, so gate the two privileged columns with a
-- before-update trigger instead: any change to `pinned` or `message_type` by a
-- non-channel-admin is rejected; everything else on the row passes untouched.
--
-- is_channel_admin resolves the correct authority per scope (race -> race admin,
-- Eboard -> eboard member, else club admin), matching the INSERT announce policy.
-- auth.uid() inside the definer function still reflects the real caller (it reads
-- the request JWT claims, which security definer does not change).
create or replace function public.enforce_message_admin_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.pinned is distinct from old.pinned
      or new.message_type is distinct from old.message_type)
     and not public.is_channel_admin(new.channel_id) then
    raise exception 'Only a channel admin can pin or announce';
  end if;
  return new;
end $$;

create trigger enforce_message_admin_fields
  before update on public.messages
  for each row execute function public.enforce_message_admin_fields();
