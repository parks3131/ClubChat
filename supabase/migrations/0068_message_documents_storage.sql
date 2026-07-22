-- Storage for chat document attachments — mirrors message-photos
-- (0027_message_photos_storage.sql) exactly, in its own bucket rather
-- than reusing message-photos: private, gated by is_channel_member on
-- the object path's first segment (`${channelId}/${uuid}.ext}`), same
-- access rule as a photo message (any channel member can attach/view).
insert into storage.buckets (id, name, public)
values ('message-documents', 'message-documents', false)
on conflict (id) do nothing;

create policy "channel members can view message documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-documents'
    and public.is_channel_member(((storage.foldername(name))[1])::uuid)
  );

create policy "channel members can upload message documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-documents'
    and public.is_channel_member(((storage.foldername(name))[1])::uuid)
  );

-- No update/delete policy — same accepted tradeoff as message-photos:
-- a document message is deleted via the messages table (existing
-- sender-or-admin UPDATE policy), which doesn't cascade to the storage
-- object.
