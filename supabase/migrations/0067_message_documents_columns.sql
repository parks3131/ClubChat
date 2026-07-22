-- Document attachments reuse messages.media_url for the storage path
-- (same column a photo message already uses) — these two new columns
-- just carry what a document bubble needs to display that a photo
-- doesn't: the original filename and its size.
alter table public.messages add column document_name text;
alter table public.messages add column document_size_bytes bigint;
