import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "../constants/theme";
import {
  deleteMessage,
  dismissReports,
  fetchMessages,
  fetchReportedMessages,
  type DisplayMessage,
  type ReportedMessage,
} from "../lib/messages";
import { reportError } from "../lib/reportError";

type Tab = "pinned" | "announcements" | "reports";

const HEADER_HEIGHT = 76;

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Shared by club and race Highlights screens — see components/ChatScreen.tsx
// for why this generalizes cleanly to just a channelId + a member-profile
// path. The Reports tab only renders for a channel admin — passing
// isAdmin=false (or omitting it) just hides it, same shape as ChatScreen's
// own isAdmin-gated actions. The custom glass header mirrors ChatScreen's
// (same Stitch redesign, extended here) — backFallback replaces the native
// Stack header's per-screen headerLeft fallback.
export interface HighlightsScreenProps {
  channelId: string;
  memberPath: (userId: string) => string;
  isAdmin?: boolean;
  backFallback: string;
}

export default function HighlightsScreen({ channelId, memberPath, isAdmin = false, backFallback }: HighlightsScreenProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(initialTab === "announcements" ? "announcements" : "pinned");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [reports, setReports] = useState<ReportedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportsLoaded, setReportsLoaded] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(backFallback);
  };

  useEffect(() => {
    fetchMessages(channelId)
      .then(setMessages)
      .finally(() => setLoading(false));
  }, [channelId]);

  const reloadReports = () => {
    fetchReportedMessages(channelId)
      .then((r) => {
        setReports(r);
        setReportsLoaded(true);
      })
      .catch(reportError);
  };

  useEffect(() => {
    if (isAdmin) reloadReports();
  }, [channelId, isAdmin]);

  const handleDeleteReported = (message: ReportedMessage) => {
    // Deleting is the resolution here, so also clear the reports that
    // prompted it — otherwise the now-tombstoned message would just sit
    // in the Reports queue forever with nothing left to do about it.
    const doDelete = () =>
      deleteMessage(message.id)
        .then(() => dismissReports(message.id))
        .then(reloadReports)
        .catch(reportError);

    if (Platform.OS === "web") {
      if (window.confirm("Delete this message? This can't be undone.")) doDelete();
      return;
    }
    Alert.alert("Delete message?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  };

  const handleDismiss = (message: ReportedMessage) => {
    dismissReports(message.id).then(reloadReports).catch(reportError);
  };

  const pinned = [...messages].filter((m) => m.pinned).reverse();
  const announcements = [...messages].filter((m) => m.messageType === "announcement").reverse();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BlurView
        intensity={80}
        tint="light"
        style={[styles.header, { paddingTop: insets.top + 12, height: HEADER_HEIGHT + insets.top }]}
      >
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <MaterialIcons name="arrow-back" size={20} color={colors.onSurface} />
        </TouchableOpacity>
        <View>
          <Text style={styles.logoText}>ClubChat</Text>
          <Text style={styles.subtitleText}>Highlights</Text>
        </View>
      </BlurView>

      <View style={[styles.tabRow, { marginTop: HEADER_HEIGHT + insets.top }]}>
        <TouchableOpacity style={[styles.tab, tab === "pinned" && styles.tabActive]} onPress={() => setTab("pinned")}>
          <Text style={[styles.tabText, tab === "pinned" && styles.tabTextActive]}>Pinned</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "announcements" && styles.tabActive]}
          onPress={() => setTab("announcements")}
        >
          <Text style={[styles.tabText, tab === "announcements" && styles.tabTextActive]}>Announcements</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity style={[styles.tab, tab === "reports" && styles.tabActive]} onPress={() => setTab("reports")}>
            <Text style={[styles.tabText, tab === "reports" && styles.tabTextActive]}>
              Reports{reports.length > 0 ? ` (${reports.length})` : ""}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {tab === "reports" ? (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>{reportsLoaded ? "No reported messages." : ""}</Text>
          }
          renderItem={({ item }) => (
            <ReportRow item={item} memberPath={memberPath} router={router} onDelete={handleDeleteReported} onDismiss={handleDismiss} />
          )}
        />
      ) : (
        <FlatList
          data={tab === "pinned" ? pinned : announcements}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>{tab === "pinned" ? "No pinned messages yet." : "No announcements yet."}</Text>
          }
          renderItem={({ item }) => <HighlightRow item={item} tab={tab} memberPath={memberPath} router={router} />}
        />
      )}
    </View>
  );
}

function HighlightRow({
  item,
  tab,
  memberPath,
  router,
}: {
  item: DisplayMessage;
  tab: Tab;
  memberPath: (userId: string) => string;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => router.push(memberPath(item.senderId))}>
        {item.senderAvatarUrl ? (
          <Image source={{ uri: item.senderAvatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{item.senderName.charAt(0).toUpperCase() || "?"}</Text>
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={styles.senderName}>{item.senderName}</Text>
          {tab === "pinned" && <MaterialIcons name="push-pin" size={12} color={colors.primary} />}
          <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
        </View>
        {item.deletedAt ? (
          <Text style={styles.deletedText}>This message was deleted</Text>
        ) : item.messageType === "photo" && item.photoUrl ? (
          <View>
            <Image source={{ uri: item.photoUrl }} style={styles.photoThumb} resizeMode="cover" />
            {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
          </View>
        ) : (
          <Text style={styles.body}>{item.body}</Text>
        )}
      </View>
    </View>
  );
}

function ReportRow({
  item,
  memberPath,
  router,
  onDelete,
  onDismiss,
}: {
  item: ReportedMessage;
  memberPath: (userId: string) => string;
  router: ReturnType<typeof useRouter>;
  onDelete: (item: ReportedMessage) => void;
  onDismiss: (item: ReportedMessage) => void;
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => router.push(memberPath(item.senderId))}>
        {item.senderAvatarUrl ? (
          <Image source={{ uri: item.senderAvatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{item.senderName.charAt(0).toUpperCase() || "?"}</Text>
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={styles.senderName}>{item.senderName}</Text>
          <Text style={styles.reportCount}>
            {item.reportCount} report{item.reportCount === 1 ? "" : "s"}
          </Text>
          <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
        </View>
        {item.deletedAt ? (
          <Text style={styles.deletedText}>This message was deleted</Text>
        ) : item.messageType === "photo" && item.photoUrl ? (
          <View>
            <Image source={{ uri: item.photoUrl }} style={styles.photoThumb} resizeMode="cover" />
            {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
          </View>
        ) : (
          <Text style={styles.body}>{item.body}</Text>
        )}
        <View style={styles.reportActions}>
          {!item.deletedAt && (
            <TouchableOpacity onPress={() => onDelete(item)}>
              <Text style={styles.deleteAction}>Delete message</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onDismiss(item)}>
            <Text style={styles.dismissAction}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.stackSm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  logoText: {
    ...typography.headlineLgMobile,
    fontSize: 22,
    color: colors.primary,
    textTransform: "uppercase",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },
  subtitleText: { ...typography.labelSm, fontSize: 9, color: colors.onSurfaceVariant, marginTop: 2 },
  tabRow: { flexDirection: "row", padding: spacing.stackSm, gap: spacing.stackSm },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.stackSm + 2,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.labelSm, color: colors.onSecondaryContainer, textTransform: "none" },
  tabTextActive: { color: colors.onPrimary },
  list: { padding: spacing.stackSm, paddingTop: 0, gap: spacing.stackSm },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.stackSm + 2,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  avatarInitial: { ...typography.labelSm, fontSize: 14, color: colors.primary },
  rowBody: { flex: 1 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.unit + 2 },
  senderName: { ...typography.bodyMd, fontWeight: "700", fontSize: 14, color: colors.onSurface },
  reportCount: { ...typography.labelSm, color: colors.error, textTransform: "none" },
  time: { ...typography.labelSm, color: colors.onSurfaceVariant, marginLeft: "auto", textTransform: "none" },
  body: { ...typography.bodyMd, fontSize: 15, color: colors.onSurface, marginTop: spacing.unit },
  deletedText: { ...typography.bodyMd, fontSize: 15, color: colors.onSurfaceVariant, fontStyle: "italic", marginTop: spacing.unit },
  photoThumb: { width: 160, height: 160, borderRadius: radii.DEFAULT, marginTop: spacing.unit, backgroundColor: colors.surfaceVariant },
  reportActions: { flexDirection: "row", gap: spacing.gutter, marginTop: spacing.stackSm },
  deleteAction: { fontSize: 13, color: colors.error, fontWeight: "600" },
  dismissAction: { fontSize: 13, color: colors.onSurfaceVariant },
});
