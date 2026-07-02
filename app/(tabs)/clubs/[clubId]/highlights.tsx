import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fetchMessages, type DisplayMessage } from "../../../../lib/messages";
import { useClub } from "./_layout";

type Tab = "pinned" | "announcements";

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HighlightsScreen() {
  const club = useClub();
  const router = useRouter();
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(initialTab === "announcements" ? "announcements" : "pinned");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages(club.channelId)
      .then(setMessages)
      .finally(() => setLoading(false));
  }, [club.channelId]);

  const pinned = [...messages].filter((m) => m.pinned).reverse();
  const announcements = [...messages].filter((m) => m.messageType === "announcement").reverse();
  const data = tab === "pinned" ? pinned : announcements;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, tab === "pinned" && styles.tabActive]} onPress={() => setTab("pinned")}>
          <Text style={[styles.tabText, tab === "pinned" && styles.tabTextActive]}>Pinned</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "announcements" && styles.tabActive]}
          onPress={() => setTab("announcements")}
        >
          <Text style={[styles.tabText, tab === "announcements" && styles.tabTextActive]}>Announcements</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>{tab === "pinned" ? "No pinned messages yet." : "No announcements yet."}</Text>
        }
        renderItem={({ item }) => <HighlightRow item={item} tab={tab} clubId={club.clubId} router={router} />}
      />
    </View>
  );
}

function HighlightRow({
  item,
  tab,
  clubId,
  router,
}: {
  item: DisplayMessage;
  tab: Tab;
  clubId: string;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => router.push(`/clubs/${clubId}/member/${item.senderId}`)}>
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
          {tab === "pinned" && <Text style={styles.pinIcon}>📌</Text>}
          <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
        </View>
        <Text style={styles.body}>{item.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", padding: 12, gap: 8 },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
  },
  tabActive: { backgroundColor: "#2563eb" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#334155" },
  tabTextActive: { color: "#fff" },
  list: { padding: 12, paddingTop: 0, gap: 8 },
  empty: { textAlign: "center", marginTop: 40, color: "#888" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    padding: 12,
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { backgroundColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 14, fontWeight: "700", color: "#475569" },
  rowBody: { flex: 1 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  senderName: { fontWeight: "700", fontSize: 14, color: "#334155" },
  pinIcon: { fontSize: 12 },
  time: { fontSize: 12, color: "#94a3b8", marginLeft: "auto" },
  body: { fontSize: 15, color: "#0f172a", marginTop: 4 },
});
