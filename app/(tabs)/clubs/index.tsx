import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../../contexts/AuthProvider";
import { fetchMyClubs, type ClubWithRole } from "../../../lib/clubs";

export default function ClubsListScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [clubs, setClubs] = useState<ClubWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      setLoading(true);

      fetchMyClubs(session.user.id)
        .then((data) => {
          if (!cancelled) setClubs(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load clubs");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/clubs/create")}>
          <Text style={styles.actionButtonText}>Create club</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => router.push("/clubs/join")}
        >
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>Join club</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={clubs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.clubRow} onPress={() => router.push(`/clubs/${item.id}/chat`)}>
              <Text style={styles.clubName}>{item.name}</Text>
              {item.role === "admin" && <Text style={styles.adminBadge}>Admin</Text>}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>You haven't joined any clubs yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  actions: { flexDirection: "row", gap: 12, marginBottom: 16 },
  actionButton: { flex: 1, backgroundColor: "#2563eb", borderRadius: 8, padding: 12, alignItems: "center" },
  secondaryButton: { backgroundColor: "#eef2ff" },
  actionButtonText: { color: "#fff", fontWeight: "600" },
  secondaryButtonText: { color: "#2563eb" },
  clubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  clubName: { fontSize: 18 },
  adminBadge: { fontSize: 12, color: "#2563eb", fontWeight: "700", textTransform: "uppercase" },
  empty: { textAlign: "center", marginTop: 40, color: "#888" },
  error: { color: "#dc2626", textAlign: "center", marginTop: 40 },
});
