-- Storage for chat photo attachments (task: photo attachments in chat).
--
-- Unlike the avatars/club-avatars buckets, this bucket is NOT public: chat
-- content (including a private Eboard channel's photos, see
-- 0017_eboard.sql) should be gated by the same is_channel_member check
-- that already protects the messages table itself, not servable to
-- anyone holding a guessable URL. Objects are keyed as
-- `${channelId}/${uuid}.${ext}`, so `is_channel_member` can be applied to
-- the first path segment for both read and write.
insert into storage.buckets (id, name, public)
values ('message-photos', 'message-photos', false)
on conflict (id) do nothing;

create policy "channel members can view message photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-photos'
    and public.is_channel_member(((storage.foldername(name))[1])::uuid)
  );

create policy "channel members can upload message photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-photos'
    and public.is_channel_member(((storage.foldername(name))[1])::uuid)
  );

-- No update/delete policy: a photo message is deleted via the messages
-- table (its own RLS already allows sender-or-admin delete), which does
-- not cascade to the storage object — acceptable at this scope, same
-- "no cleanup job yet" tradeoff already accepted elsewhere in this repo.
