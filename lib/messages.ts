import type { MentionCandidate } from "./mentions";
import { supabase } from "./supabase";
import type { MessageType } from "../types/database";

export interface DisplayMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  messageType: MessageType;
  body: string | null;
  photoUrl: string | null;
  documentUrl: string | null;
  documentName: string | null;
  documentSizeBytes: number | null;
  pollId: string | null;
  eventId: string | null;
  meetingId: string | null;
  pinned: boolean;
  createdAt: string;
  deletedAt: string | null;
  reactions: { emoji: string; userId: string }[];
  mentions: MentionCandidate[];
}

// message-photos/message-documents are private buckets (see
// 0027_message_photos_storage.sql / 0068_message_documents_storage.sql)
// gated by the same is_channel_member check as the messages table itself,
// so a displayable URL has to be a short-lived signed URL fetched per
// request rather than a stored public URL.
const PHOTO_SIGNED_URL_TTL_SECONDS = 3600;
const DOCUMENT_SIGNED_URL_TTL_SECONDS = 3600;

async function signDocumentUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from("message-documents")
    .createSignedUrls(paths, DOCUMENT_SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  const byPath = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.signedUrl) byPath.set(entry.path ?? "", entry.signedUrl);
  }
  return byPath;
}

async function signPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from("message-photos")
    .createSignedUrls(paths, PHOTO_SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  const byPath = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.signedUrl) byPath.set(entry.path ?? "", entry.signedUrl);
  }
  return byPath;
}

async function attachSendersAndReactions(
  messages: {
    id: string;
    channel_id: string;
    sender_id: string;
    message_type: MessageType;
    body: string | null;
    media_url: string | null;
    document_name: string | null;
    document_size_bytes: number | null;
    poll_id: string | null;
    event_id: string | null;
    meeting_id: string | null;
    pinned: boolean;
    created_at: string;
    deleted_at: string | null;
  }[]
): Promise<DisplayMessage[]> {
  if (messages.length === 0) return [];

  const senderIds = [...new Set(messages.map((m) => m.sender_id))];
  const messageIds = messages.map((m) => m.id);
  const photoPaths = messages.filter((m) => m.message_type === "photo" && m.media_url).map((m) => m.media_url as string);
  const documentPaths = messages.filter((m) => m.message_type === "document" && m.media_url).map((m) => m.media_url as string);

  const [{ data: profiles }, { data: reactions }, { data: mentionRows }, signedUrlByPath, signedDocumentUrlByPath] = await Promise.all([
    supabase.from("profiles").select("id, full_name, avatar_url").in("id", senderIds),
    supabase.from("message_reactions").select("message_id, user_id, emoji").in("message_id", messageIds),
    supabase.from("message_mentions").select("message_id, mentioned_user_id").in("message_id", messageIds),
    signPhotoUrls(photoPaths),
    signDocumentUrls(documentPaths),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const reactionsByMessage = new Map<string, { emoji: string; userId: string }[]>();
  for (const r of reactions ?? []) {
    const list = reactionsByMessage.get(r.message_id) ?? [];
    list.push({ emoji: r.emoji, userId: r.user_id });
    reactionsByMessage.set(r.message_id, list);
  }

  // Mentioned users' names aren't in `profiles` above unless they also
  // happen to be a sender in this batch — fetch any missing ones too.
  const mentionedIds = [...new Set((mentionRows ?? []).map((r) => r.mentioned_user_id))];
  const missingMentionedIds = mentionedIds.filter((id) => !profileById.has(id));
  if (missingMentionedIds.length > 0) {
    const { data: mentionedProfiles } = await supabase.from("profiles").select("id, full_name").in("id", missingMentionedIds);
    for (const p of mentionedProfiles ?? []) {
      profileById.set(p.id, { id: p.id, full_name: p.full_name, avatar_url: null });
    }
  }

  const mentionsByMessage = new Map<string, MentionCandidate[]>();
  for (const r of mentionRows ?? []) {
    const list = mentionsByMessage.get(r.message_id) ?? [];
    list.push({ id: r.mentioned_user_id, fullName: profileById.get(r.mentioned_user_id)?.full_name ?? "Unknown" });
    mentionsByMessage.set(r.message_id, list);
  }

  return messages.map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    senderName: profileById.get(m.sender_id)?.full_name ?? "Unknown",
    senderAvatarUrl: profileById.get(m.sender_id)?.avatar_url ?? null,
    messageType: m.message_type,
    body: m.body,
    photoUrl: m.message_type === "photo" && m.media_url ? (signedUrlByPath.get(m.media_url) ?? null) : null,
    documentUrl: m.message_type === "document" && m.media_url ? (signedDocumentUrlByPath.get(m.media_url) ?? null) : null,
    documentName: m.document_name,
    documentSizeBytes: m.document_size_bytes,
    pollId: m.poll_id,
    eventId: m.event_id,
    meetingId: m.meeting_id,
    pinned: m.pinned,
    createdAt: m.created_at,
    deletedAt: m.deleted_at,
    reactions: reactionsByMessage.get(m.id) ?? [],
    mentions: mentionsByMessage.get(m.id) ?? [],
  }));
}

export async function fetchMessages(
  channelId: string,
  options?: { limit?: number; before?: string }
): Promise<DisplayMessage[]> {
  if (options?.limit) {
    let query = supabase
      .from("messages")
      .select("id, channel_id, sender_id, message_type, body, media_url, document_name, document_size_bytes, poll_id, event_id, meeting_id, pinned, created_at, deleted_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(options.limit);

    if (options.before) {
      query = query.lt("created_at", options.before);
    }

    const { data, error } = await query;

    if (error) throw error;
    return attachSendersAndReactions((data ?? []).reverse());
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id, channel_id, sender_id, message_type, body, media_url, document_name, document_size_bytes, poll_id, event_id, meeting_id, pinned, created_at, deleted_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return attachSendersAndReactions(data ?? []);
}

export interface GalleryPhoto {
  id: string;
  photoUrl: string;
  createdAt: string;
}

// Every photo ever sent in a channel, newest first — powers the Gallery
// screen (club/race/Eboard). Reuses the same signPhotoUrls batching
// sendMessage/fetchMessages already use for chat bubbles.
export async function fetchChannelPhotos(channelId: string): Promise<GalleryPhoto[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, media_url, created_at")
    .eq("channel_id", channelId)
    .eq("message_type", "photo")
    .is("deleted_at", null)
    .not("media_url", "is", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const signedByPath = await signPhotoUrls(data.map((m) => m.media_url as string));

  return data
    .map((m) => ({ id: m.id, photoUrl: signedByPath.get(m.media_url as string) ?? null, createdAt: m.created_at }))
    .filter((p): p is GalleryPhoto => p.photoUrl !== null);
}

// Tags each id in mentionedUserIds against the just-sent message (see
// migration 0058) — a second insert rather than a column on messages
// itself, mirroring how reactions/reports are already their own side
// table. on conflict do nothing since the same user could in principle
// be selected twice from the composer's autocomplete.
async function tagMentions(messageId: string, mentionedUserIds: string[] | undefined) {
  if (!mentionedUserIds || mentionedUserIds.length === 0) return;
  const { error } = await supabase
    .from("message_mentions")
    .upsert(
      mentionedUserIds.map((userId) => ({ message_id: messageId, mentioned_user_id: userId })),
      { onConflict: "message_id,mentioned_user_id", ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function sendMessage(params: {
  channelId: string;
  senderId: string;
  body: string;
  messageType?: MessageType;
  mentionedUserIds?: string[];
}) {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      channel_id: params.channelId,
      sender_id: params.senderId,
      body: params.body,
      message_type: params.messageType ?? "text",
    })
    .select("id")
    .single();
  if (error) throw error;
  await tagMentions(data.id, params.mentionedUserIds);
}

export async function sendPhotoMessage(params: {
  channelId: string;
  senderId: string;
  fileUri: string;
  contentType: string;
  caption?: string;
}) {
  const response = await fetch(params.fileUri);
  const blob = await response.blob();
  const ext = params.contentType.split("/")[1] ?? "jpg";
  const path = `${params.channelId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("message-photos")
    .upload(path, blob, { contentType: params.contentType });
  if (uploadError) throw uploadError;

  // body and media_url already coexist on one row (see DisplayMessage) —
  // an optional caption just populates body alongside the photo, message_type
  // stays "photo" so rendering still branches on the image, not the text.
  const { error } = await supabase.from("messages").insert({
    channel_id: params.channelId,
    sender_id: params.senderId,
    message_type: "photo",
    media_url: path,
    body: params.caption?.trim() || null,
  });
  if (error) throw error;
}

// Filename's own extension (e.g. "workout_plan.pdf") is more reliable
// than deriving one from contentType, which for arbitrary document types
// (docx/xlsx/etc.) doesn't map to a simple `type/subtype` split the way
// image mime types do.
export async function sendDocumentMessage(params: {
  channelId: string;
  senderId: string;
  fileUri: string;
  contentType: string;
  fileName: string;
  fileSizeBytes: number;
}) {
  const response = await fetch(params.fileUri);
  const blob = await response.blob();
  const ext = params.fileName.includes(".") ? params.fileName.split(".").pop() : "bin";
  const path = `${params.channelId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("message-documents")
    .upload(path, blob, { contentType: params.contentType });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from("messages").insert({
    channel_id: params.channelId,
    sender_id: params.senderId,
    message_type: "document",
    media_url: path,
    document_name: params.fileName,
    document_size_bytes: params.fileSizeBytes,
  });
  if (error) throw error;
}

export async function togglePinned(messageId: string, pinned: boolean) {
  const { error } = await supabase.from("messages").update({ pinned }).eq("id", messageId);
  if (error) throw error;
}

// Soft-delete (see 0030_message_soft_delete.sql): clears the content and
// stamps deleted_at instead of removing the row, so other members see a
// "This message was deleted" tombstone in place rather than the message
// silently vanishing mid-conversation. Goes through the existing "sender
// or admin can edit a message" UPDATE policy (0003_rls.sql) — no
// separate admin check needed client-side.
export async function deleteMessage(messageId: string) {
  const { error } = await supabase
    .from("messages")
    .update({
      deleted_at: new Date().toISOString(),
      body: null,
      media_url: null,
      document_name: null,
      document_size_bytes: null,
      poll_id: null,
      event_id: null,
      meeting_id: null,
    })
    .eq("id", messageId);
  if (error) throw error;
}

export async function reportMessage(params: { messageId: string; channelId: string; reporterId: string }) {
  const { error } = await supabase.from("message_reports").insert({
    message_id: params.messageId,
    channel_id: params.channelId,
    reporter_id: params.reporterId,
  });
  // 23505 = unique_violation: this reporter already reported this
  // message (message_reports has a unique(message_id, reporter_id)) —
  // treat a repeat report as a no-op rather than an error.
  if (error && error.code !== "23505") throw error;
}

export interface ReportedMessage extends DisplayMessage {
  reportCount: number;
}

// Admin-only in practice: message_reports' select policy already scopes
// rows to a channel admin, so a non-admin's query here just comes back
// empty rather than erroring.
export async function fetchReportedMessages(channelId: string): Promise<ReportedMessage[]> {
  const { data: reports, error } = await supabase
    .from("message_reports")
    .select("message_id")
    .eq("channel_id", channelId);
  if (error) throw error;
  if (!reports || reports.length === 0) return [];

  const countByMessageId = new Map<string, number>();
  for (const r of reports) countByMessageId.set(r.message_id, (countByMessageId.get(r.message_id) ?? 0) + 1);

  const { data: messageRows, error: messagesError } = await supabase
    .from("messages")
    .select("id, channel_id, sender_id, message_type, body, media_url, document_name, document_size_bytes, poll_id, event_id, meeting_id, pinned, created_at, deleted_at")
    .in("id", [...countByMessageId.keys()]);
  if (messagesError) throw messagesError;

  const displayMessages = await attachSendersAndReactions(messageRows ?? []);
  return displayMessages
    .map((m) => ({ ...m, reportCount: countByMessageId.get(m.id) ?? 0 }))
    .sort((a, b) => b.reportCount - a.reportCount);
}

// Clears all reports on a message — used once an admin has acted on them
// (deleted the message, or decided it wasn't a real issue).
export async function dismissReports(messageId: string) {
  const { error } = await supabase.from("message_reports").delete().eq("message_id", messageId);
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

// A monotonic per-call suffix keeps each subscription's topic unique.
// supabase.channel(topic) reuses an existing channel object for an
// identical topic string, and `removeChannel()`'s cleanup is async
// (unsubscribe() awaits a server round-trip before removing/tearing down
// the old channel) — React's effect cleanup doesn't await it, so a fast
// unmount+remount of the same chat screen (same channelId) can call this
// again before the old channel has actually finished leaving, getting
// back that still-"joined" channel and throwing "cannot add
// postgres_changes callbacks ... after subscribe()". lib/notifications.ts
// hit the same underlying issue (a fixed `tag` param there, since it only
// ever has 2 known concurrent callers) — this needs a fresh id per call
// instead, since the same single caller can remount rapidly for the same
// channelId.
let subscriptionCounter = 0;

export function subscribeToNewMessages(channelId: string, onChange: () => void) {
  const subscription = supabase
    .channel(`messages:${channelId}:${++subscriptionCounter}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
      onChange
    )
    // message_reactions/message_mentions have no channel_id column to
    // filter on, so these listen project-wide and let the caller refetch;
    // fine at MVP scale.
    .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "message_mentions" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(subscription);
  };
}
