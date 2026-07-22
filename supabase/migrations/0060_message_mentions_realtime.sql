-- message_mentions is tagged via a second insert right after the message
-- itself (see lib/messages.ts's sendMessage/tagMentions), so a receiving
-- client's messages-table realtime event can fire and reload() before the
-- mention row exists yet, rendering without the highlight until some
-- later unrelated refresh. Same reasoning 0005_realtime.sql already added
-- message_reactions for; message_mentions needs the same treatment so
-- ChatScreen's subscription (lib/messages.ts's subscribeToNewMessages)
-- can listen for it and reload once tagging actually lands.
alter publication supabase_realtime add table public.message_mentions;
