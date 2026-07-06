import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fetchMeetings, type EboardMeeting } from "../../../../../lib/eboard";
import { useEboard } from "./_layout";

function formatMeetingDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Only a member can be here — index.tsx never links to /meetings
// otherwise, but a direct URL hit needs its own guard (same as chat.tsx).
export default function EboardMeetingsScreen() {
  const eboard = useEboard();
  const router = useRouter();
  const [meetings, setMeetings] = useState<EboardMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eboard.channel?.isMember) {
      router.replace(`/clubs/${eboard.clubId}/eboard`);
    }
  }, [eboard.channel, eboard.clubId, router]);

  useFocusEffect(
    useCallback(() => {
      if (!eboard.channel?.isMember) return;
      let cancelled = false;
      setLoading(true);
      fetchMeetings(eboard.channel.id)
        .then((data) => {
          if (!cancelled) setMeetings(data);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [eboard.channel])
  );

  if (!eboard.channel?.isMember || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const now = Date.now();
  const upcoming = meetings.filter((m) => new Date(m.meetingAt).getTime() >= now);
  const past = meetings.filter((m) => new Date(m.meetingAt).getTime() < now).reverse();

  const sections = [
    { title: "Upcoming", data: upcoming },
    { title: "Past", data: past },
  ].filter((s) => s.data.length > 0);

  return (
    <View style={styles.container}>
      <FlatList
        data={sections}
        keyExtractor={(s) => s.title}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No meetings yet.</Text>}
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.sectionHeader}>{section.title}</Text>
            {section.data.map((meeting) => (
              <TouchableOpacity
                key={meeting.id}
                style={styles.row}
                onPress={() => router.push(`/clubs/${eboard.clubId}/eboard/meeting/${meeting.id}`)}
              >
                <Text style={styles.rowTitle}>{meeting.title}</Text>
                <Text style={styles.rowDate}>{formatMeetingDate(meeting.meetingAt)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push(`/clubs/${eboard.clubId}/eboard/meeting/create`)}
      >
        <Text style={styles.fabText}>+ New meeting</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 12, paddingBottom: 80 },
  empty: { textAlign: "center", marginTop: 40, color: "#888" },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  row: { backgroundColor: "#f1f5f9", borderRadius: 10, padding: 12, marginBottom: 8 },
  rowTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  rowDate: { fontSize: 13, color: "#334155", marginTop: 4 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: "#2563eb",
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  fabText: { color: "#fff", fontWeight: "700" },
});
