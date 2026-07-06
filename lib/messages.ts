import { supabase } from "./supabase";
import type { MessageType } from "../types/database";

export interface DisplayMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  messageType: MessageType;
  body: string | null;
  pinned: boolean;
  createdAt: string;
  reactions: { emoji: string; userId: string }[];
}

async function attachSendersAndReactions(
  messages: { id: string; channel_id: string; sender_id: string; message_type: MessageType; body: string | null; pinned: boolean; created_at: string }[]
): Promise<DisplayMessage[]> {
  if (messages.length === 0) return [];

  const senderIds = [...new Set(messages.map((m) => m.sender_id))];
  const messageIds = messages.map((m) => m.id);

  const [{ data: profiles }, { data: reactions }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, avatar_url").in("id", senderIds),
    supabase.from("message_reactions").select("message_id, user_id, emoji").in("message_id", messageIds),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const reactionsByMessage = new Map<string, { emoji: string; userId: string }[]>();
  for (const r of reactions ?? []) {
    const list = reactionsByMessage.get(r.message_id) ?? [];
    list.push({ emoji: r.emoji, userId: r.user_id });
    reactionsByMessage.set(r.message_id, list);
  }

  return messages.map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    senderName: profileById.get(m.sender_id)?.full_name ?? "Unknown",
    senderAvatarUrl: profileById.get(m.sender_id)?.avatar_url ?? null,
    messageType: m.message_type,
    body: m.body,
    pinned: m.pinned,
    createdAt: m.created_at,
    reactions: reactionsByMessage.get(m.id) ?? [],
  }));
}

export async function fetchMessages(
  channelId: string,
  options?: { limit?: number }
): Promise<DisplayMessage[]> {
  if (options?.limit) {
    const { data, error } = await supabase
      .from("messages")
      .select("id, channel_id, sender_id, message_type, body, pinned, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(options.limit);

    if (error) throw error;
    return attachSendersAndReactions((data ?? []).reverse());
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id, channel_id, sender_id, message_type, body, pinned, created_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return attachSendersAndReactions(data ?? []);
}

export async function sendMessage(params: {
  channelId: string;
  senderId: string;
  body: string;
  messageType?: MessageType;
}) {
  const { error } = await supabase.from("messages").insert({
    channel_id: params.channelId,
    sender_id: params.senderId,
    body: params.body,
    message_type: params.messageType ?? "text",
  });
  if (error) throw error;
}

export async function togglePinned(messageId: string, pinned: boolean) {
  const { error } = await supabase.from("messages").update({ pinned }).eq("id", messageId);
  if (error) throw error;
}

export async function toggleReaction(messageId: string, userId: string, emoji: string) {
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("message_id")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("message_reactions").insert({ message_id: messageId, user_id: userId, emoji });
    if (error) throw error;
  }
}

export function subscribeToNewMessages(channelId: string, onChange: () => void) {
  const subscription = supabase
    .channel(`messages:${channelId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
      onChange
    )
    // message_reactions has no channel_id column to filter on, so this
    // listens project-wide and lets the caller refetch; fine at MVP scale.
    .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(subscription);
  };
}
