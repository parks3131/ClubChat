import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../components/LoadError";
import { colors, radii, spacing, typography, type MaterialIconName } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthProvider";
import { useNotifications } from "../../contexts/NotificationsProvider";
import { timeAgo } from "../../lib/dates";
import { fetchNotificationFeed, subscribeToNotifications, type NotificationFeedItem } from "../../lib/notifications";
import type { NotificationType } from "../../types/database";

const ICON_BY_TYPE: Record<NotificationType, MaterialIconName> = {
  club_join_request: "person-add",
  race_join_request: "person-add",
  eboard_join_request: "person-add",
  request_approved: "check-circle",
  request_denied: "cancel",
  member_added: "group-add",
  member_removed: "person-remove",
  role_changed: "military-tech",
  poll_created: "poll",
  event_created: "event",
  race_created: "flag",
  meeting_created: "groups",
  announcement: "campaign",
  poll_closing_soon: "timer",
  chat_caught_up: "done-all",
};

const PAGE_SIZE = 20;

// createdAt/atIso is a Postgres timestamptz rendered as ISO 8601 — same
// merge-by-id-then-resort technique ChatScreen.tsx's mergeMessages uses,
// just sorted newest-first instead of oldest-first, so a focus/realtime
// reload of page 1 never discards older pages already loaded via scroll.
//
// `replaceChatUnread` must be true for any *page-1* fetch (load()'s own
// focus/realtime calls) and false for a `before`-cursored "load older"
// page. chat_unread items are never paginated — fetchNotificationFeed
// only fetches them on an uncursored call — so a page-1 result is always
// the complete, authoritative current set of unread channels. Without
// this, a channel that gets fully read (and drops out of the RPC's
// results) never gets removed from local state: union-by-id only ever
// adds/overwrites, so the old dark "N unread" row would linger forever
// alongside its own new light "Caught up on N" history entry (task #47)
// — exactly the confusing double-row the founder flagged live. A `before`
// page never includes chat_unread items at all (see
// fetchNotificationFeed), so wiping them there would incorrectly drop
// still-valid unread rows just because this *older-notifications-only*
// page didn't happen to mention them.
function mergeFeedItems(
  existing: NotificationFeedItem[],
  incoming: NotificationFeedItem[],
  replaceChatUnread: boolean
): NotificationFeedItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  if (replaceChatUnread) {
    for (const [id, item] of byId) {
      if (item.kind === "chat_unread") byId.delete(id);
    }
  }
  for (const i of incoming) byId.set(i.id, i);
  return [...byId.values()].sort((a, b) => new Date(b.atIso).getTime() - new Date(a.atIso).getTime());
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { markAllRead } = useNotifications();
  const [items, setItems] = useState<NotificationFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    fetchNotificationFeed(userId, { limit: PAGE_SIZE })
      .then((page) => {
        setItems((prev) => mergeFeedItems(prev, page, true));
        setHasMoreOlder(page.filter((i) => i.kind === "notification").length === PAGE_SIZE);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [userId]);

  // Marks read on BLUR (leaving the screen), not on focus — items you're
  // currently looking at stay dark-shaded for this whole visit, so
  // "unread" is actually visible instead of flipping to read before you
  // can perceive it; they only turn light the *next* time you open this
  // tab. Still only discrete items — markAllRead never touches
  // chat-unread rows (see lib/notifications.ts's
  // markAllNotificationsRead), so a "48 unread in Club X chat" row stays
  // exactly as real until that chat is actually opened, same as before.
  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        markAllRead();
      };
    }, [load, markAllRead])
  );

  useEffect(() => {
    if (!userId) return;
    return subscribeToNotifications(userId, load, "screen");
  }, [userId, load]);

  const handleLoadMore = useCallback(() => {
    if (!userId || !hasMoreOlder || loadingMore) return;
    const oldestNotification = [...items].reverse().find((i) => i.kind === "notification");
    if (!oldestNotification) return;

    setLoadingMore(true);
    fetchNotificationFeed(userId, { limit: PAGE_SIZE, before: oldestNotification.atIso })
      .then((page) => {
        setItems((prev) => mergeFeedItems(prev, page, false));
        // A `before`-cursored page never includes chat_unread items (see
        // fetchNotificationFeed), so its length is exactly the raw
        // notifications row count for this page.
        setHasMoreOlder(page.length === PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [userId, hasMoreOlder, loadingMore, items]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return <LoadError message="Couldn't load notifications." onRetry={load} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.5}
        onEndReached={handleLoadMore}
        ListEmptyComponent={<Text style={styles.empty}>You're all caught up.</Text>}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> : null}
        renderItem={({ item }) => {
          if (item.kind === "chat_unread") {
            // Always rendered unread — this row only exists in the feed
            // while unreadCount > 0 (see fetch_unread_channel_summaries),
            // and, like a pending join request, only clears by actually
            // opening the chat (markChannelRead), never by glancing at
            // this list.
            return (
              <TouchableOpacity style={[styles.row, styles.rowUnread]} onPress={() => router.push(item.targetPath)}>
                <View style={[styles.iconWrap, styles.iconWrapUnread]}>
                  <MaterialIcons name="chat-bubble" size={20} color={colors.onPrimary} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowText}>
                    <Text style={styles.rowTextBold}>{item.unreadCount} unread</Text>
                    {" messages in "}
                    <Text style={styles.rowTextBold}>{item.channelName}</Text>
                    {" chat"}
                  </Text>
                  <Text style={styles.rowTime}>{timeAgo(item.atIso)}</Text>
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              style={[styles.row, item.isUnread && styles.rowUnread]}
              onPress={() => router.push(item.targetPath)}
            >
              <View style={[styles.iconWrap, item.isUnread && styles.iconWrapUnread]}>
                <MaterialIcons
                  name={ICON_BY_TYPE[item.type]}
                  size={20}
                  color={item.isUnread ? colors.onPrimary : colors.onSurfaceVariant}
                />
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowText, item.isUnread && styles.rowTextUnread]}>{item.body}</Text>
                <View style={styles.rowMetaRow}>
                  <Text style={styles.rowTime}>{timeAgo(item.atIso)}</Text>
                  {item.resolvedOutcome && (
                    <Text
                      style={[
                        styles.resolvedTag,
                        item.resolvedOutcome === "denied" && styles.resolvedTagDenied,
                      ]}
                    >
                      {item.resolvedOutcome === "approved" ? "Approved" : "Denied"}
                    </Text>
                  )}
                </View>
              </View>
              {item.isUnread && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.marginMobile, paddingBottom: 40 },
  footerLoader: { marginVertical: spacing.gutter },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant, ...typography.bodyMd },
  row: {
    flexDirection: "row",
    gap: spacing.gutter,
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
    marginBottom: spacing.stackSm,
  },
  // The actual "darker until seen" shade — a light primary tint (same M3
  // "unread container" pattern the *Fixed tokens already exist for),
  // distinct from the plain white surfaceContainerLowest a read row keeps.
  rowUnread: { backgroundColor: colors.primaryFixed, borderColor: colors.primaryFixedDim },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceContainerHigh,
  },
  iconWrapUnread: { backgroundColor: colors.primary },
  rowBody: { flex: 1 },
  rowText: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant },
  rowTextUnread: { color: colors.onSurface },
  rowTextBold: { fontFamily: "Inter_600SemiBold" },
  rowMetaRow: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm, marginTop: 4 },
  rowTime: { ...typography.labelSm, fontSize: 11, color: colors.outline, textTransform: "none" },
  resolvedTag: {
    ...typography.labelSm,
    fontSize: 10,
    color: colors.onPrimaryFixedVariant,
    backgroundColor: colors.primaryFixed,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
    textTransform: "none",
  },
  resolvedTagDenied: { color: colors.onErrorContainer, backgroundColor: colors.errorContainer },
  unreadDot: { width: 8, height: 8, borderRadius: radii.full, backgroundColor: colors.primary },
});
