import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { fetchPolls, type PollListItem } from "../../../../../lib/polls";
import { useClub } from "../_layout";

export default function PollsListScreen() {
  const club = useClub();
  const router = useRouter();
  const [polls, setPolls] = useState<PollListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchPolls(club.clubId)
      .then((data) => {
        setPolls(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [club.clubId]);

  useFocusEffect(load);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (loadError) {
    return <LoadError message="Couldn't load polls." onRetry={load} />;
  }

  const active = polls.filter((p) => !p.isClosed);
  const closed = polls.filter((p) => p.isClosed);

  const sections = [
    { title: "Active", data: active },
    { title: "Closed", data: closed },
  ].filter((s) => s.data.length > 0);

  return (
    <View style={styles.container}>
      <FlatList
        data={sections}
        keyExtractor={(s) => s.title}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No polls yet.</Text>}
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.sectionHeader}>{section.title}</Text>
            {section.data.map((poll) => (
              <TouchableOpacity
                key={poll.id}
                style={styles.row}
                onPress={() => router.push(`/clubs/${club.clubId}/polls/${poll.id}`)}
              >
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle}>{poll.question}</Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
                <Text style={styles.rowMeta}>
                  {poll.optionCount} option{poll.optionCount === 1 ? "" : "s"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      />

      {club.role === "admin" && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push(`/clubs/${club.clubId}/polls/create`)}>
          <Text style={styles.fabText}>+ Create Poll</Text>
        </TouchableOpacity>
      )}
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
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", flexShrink: 1 },
  rowMeta: { fontSize: 13, color: "#334155", marginTop: 4 },
  chevron: { fontSize: 20, color: "#94a3b8" },
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
