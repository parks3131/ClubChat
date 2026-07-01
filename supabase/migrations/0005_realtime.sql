-- Enables postgres_changes realtime events for chat. Without this, INSERTs
-- into messages happen fine but no client ever gets notified of them.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
