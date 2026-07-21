import { supabase } from "./supabase";
import type { NotificationType } from "../types/database";

export type NotificationFeedItem =
  | {
      kind: "notification";
      id: string;
      type: NotificationType;
      body: string;
      targetPath: string;
      isUnread: boolean;
      resolvedOutcome: "approved" | "denied" | null;
      atIso: string;
    }
  | {
      kind: "chat_unread";
      id: string;
      channelName: string;
      unreadCount: number;
      targetPath: string;
      atIso: string;
    };

function targetPathForChannel(row: {
  club_id: string;
  race_id: string | null;
  eboard_channel_id: string | null;
}) {
  if (row.race_id) return `/clubs/${row.club_id}/race/${row.race_id}/chat`;
  if (row.eboard_channel_id) return `/clubs/${row.club_id}/eboard/chat`;
  return `/clubs/${row.club_id}/chat`;
}

async function fetchChatUnreadItems(): Promise<NotificationFeedItem[]> {
  const { data, error } = await supabase.rpc("fetch_unread_channel_summaries");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    kind: "chat_unread" as const,
    id: `chat:${c.channel_id}`,
    channelName: c.channel_name ?? "Chat",
    unreadCount: c.unread_count,
    targetPath: targetPathForChannel(c),
    atIso: c.last_message_at ?? new Date(0).toISOString(),
  }));
}

// Merges two independently-scoped sources into one reverse-chronological
// feed, the same "merge heterogeneous sources into one array" technique
// lib/calendarFeed.ts already uses for the unified calendar:
//   - notifications: discrete events (join requests, membership changes,
//     poll/event/race/meeting creation, announcements). Paginated the
//     same way lib/messages.ts's fetchMessages is (no options = full
//     unbounded fetch; a limit paginates, an additional `before` cursor
//     fetches the next older page) — mirrors ChatScreen's task #28
//     "load earlier" pattern.
//   - fetch_unread_channel_summaries(): a live-computed row per channel
//     with unread messages, not a stored/paginated notification — see
//     0031_notifications_core.sql. Only fetched on the first page (no
//     `before` cursor): it's bounded by the number of channels the user
//     belongs to, not something that grows page over page, and it's
//     deliberately never marked "read" by opening this feed — it only
//     changes when the channel itself is actually opened
//     (markChannelRead).
export async function fetchNotificationFeed(
  userId: string,
  options?: { limit?: number; before?: string }
): Promise<NotificationFeedItem[]> {
  let notifQuery = supabase
    .from("notifications")
    .select("id, type, body, target_path, resolved_outcome, read_at, created_at")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false });
  if (options?.limit) notifQuery = notifQuery.limit(options.limit);
  if (options?.before) notifQuery = notifQuery.lt("created_at", options.before);

  const [{ data: notifRows, error: notifError }, chatItems] = await Promise.all([
    notifQuery,
    options?.before ? Promise.resolve([]) : fetchChatUnreadItems(),
  ]);
  if (notifError) throw notifError;

  const items: NotificationFeedItem[] = [...chatItems];

  for (const n of notifRows ?? []) {
    items.push({
      kind: "notification",
      id: n.id,
      type: n.type,
      body: n.body,
      targetPath: n.target_path,
      isUnread: n.read_at === null,
      resolvedOutcome: n.resolved_outcome,
      atIso: n.created_at,
    });
  }

  items.sort((a, b) => new Date(b.atIso).getTime() - new Date(a.atIso).getTime());
  return items;
}

// Cheap count-only query for the tab bar badge — avoids fetching the
// full feed just for a number. Each unread discrete notification, and
// each channel with any unread messages, counts as exactly 1 (never a
// raw per-message sum).
export async function fetchUnreadBadgeCount(userId: string): Promise<number> {
  const [{ count: notifCount, error: notifError }, { data: chatRows, error: chatError }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null),
    supabase.rpc("fetch_unread_channel_summaries"),
  ]);
  if (notifError) throw notifError;
  if (chatError) throw chatError;

  return (notifCount ?? 0) + (chatRows?.length ?? 0);
}

// Bulk-marks every currently-unread *discrete* notification as read —
// except the 3 pending-join-request-inbox types, which are deliberately
// excluded here and instead cleared only by markNotificationsReadForPath
// (called from the actual roster/request screen each one points at).
// Those need the same "only clears once you actually go look" guarantee
// chat-unread rows already have via markChannelRead — glancing at the
// Notifications feed shouldn't be enough to silently dismiss a pending
// request nobody's reviewed yet.
const JOIN_REQUEST_TYPES = ["club_join_request", "race_join_request", "eboard_join_request"] as const;

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null)
    .not("type", "in", `(${JOIN_REQUEST_TYPES.join(",")})`);
  if (error) throw error;
}

// Mirrors markChannelRead's shape: clears every unread notification whose
// target_path matches the screen the caller just actually visited (e.g. a
// race's roster), rather than every notification for the caller overall.
// Bulk-inserted trigger rows (0033_notification_triggers_requests.sql) use
// a fixed, predictable target_path per scope, so an exact match is safe —
// a non-admin visiting the same path simply matches zero rows.
export async function markNotificationsReadForPath(userId: string, targetPath: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .eq("target_path", targetPath)
    .is("read_at", null);
  if (error) throw error;
}

export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("channel_reads")
    .upsert({ channel_id: channelId, user_id: userId, last_read_at: new Date().toISOString() });
  if (error) throw error;
}

// `tag` keeps the realtime channel topic unique per independent
// subscriber (NotificationsProvider's badge count vs. the Notifications
// screen's full feed both subscribe for the same userId at once) —
// supabase-js reuses an existing channel object for an identical topic,
// and calling `.on()` on one that's already subscribed throws "cannot
// add postgres_changes callbacks ... after subscribe()". The `tag`
// distinguishes those two known callers, but doesn't protect a single
// caller against its own fast unmount+remount (removeChannel()'s cleanup
// is async and React doesn't await it in an effect's cleanup) — see
// lib/messages.ts's subscribeToNewMessages, which hit exactly that
// variant live and added a per-call counter for it; append one here too.
let subscriptionCounter = 0;

export function subscribeToNotifications(userId: string, onChange: () => void, tag: string = "default") {
  const subscription = supabase
    .channel(`notifications:${userId}:${tag}:${++subscriptionCounter}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
      onChange
    )
    // messages has no recipient to filter on for "does this affect my
    // chat-unread count" — listen project-wide and let the caller
    // refetch, same tradeoff lib/messages.ts already makes for
    // message_reactions.
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(subscription);
  };
}
