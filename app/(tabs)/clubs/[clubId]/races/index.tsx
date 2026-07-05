import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fetchRaces, requestJoinRace, type RaceListItem } from "../../../../../lib/races";
import { useClub } from "../_layout";

function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// event_date comes back as a plain "YYYY-MM-DD" string — format from its
// own y/m/d components rather than `new Date(iso)`, which parses as UTC
// midnight and can display a day early in timezones behind UTC (the same
// bug formatDateOfBirth in lib/profile.ts was fixed for).
function formatEventDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RacesListScreen() {
  const club = useClub();
  const router = useRouter();
  const [races, setRaces] = useState<RaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchRaces(club.clubId, club.role === "admin")
      .then(setRaces)
      .finally(() => setLoading(false));
  }, [club.clubId, club.role]);

  useFocusEffect(load);

  const handleRequest = async (raceId: string) => {
    setRequesting(raceId);
    try {
      await requestJoinRace(raceId);
      load();
    } finally {
      setRequesting(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const todayKey = toDateKey(new Date());
  const upcoming = races.filter((r) => r.eventDate >= todayKey);
  const finished = races.filter((r) => r.eventDate < todayKey).reverse();

  const sections = [
    { title: "Upcoming", data: upcoming },
    { title: "Finished", data: finished },
  ].filter((s) => s.data.length > 0);

  return (
    <View style={styles.container}>
      <FlatList
        data={sections}
        keyExtractor={(s) => s.title}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No races or meets yet.</Text>}
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.sectionHeader}>{section.title}</Text>
            {section.data.map((race) => {
              const canEnter = race.access !== "none";
              return (
                <TouchableOpacity
                  key={race.id}
                  style={styles.row}
                  disabled={!canEnter}
                  onPress={() => canEnter && router.push(`/clubs/${club.clubId}/race/${race.id}`)}
                >
                  <View style={styles.rowHeader}>
                    <Text style={styles.rowTitle}>{race.name}</Text>
                    {canEnter ? (
                      <Text style={styles.chevron}>›</Text>
                    ) : race.requestStatus === "pending" ? (
                      <Text style={styles.requested}>Requested</Text>
                    ) : (
                      <TouchableOpacity
                        style={styles.requestButton}
                        disabled={requesting === race.id}
                        onPress={() => handleRequest(race.id)}
                      >
                        <Text style={styles.requestButtonText}>
                          {requesting === race.id ? "Requesting…" : "Request to join"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.rowDate}>{formatEventDate(race.eventDate)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      />

      {club.role === "admin" && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push(`/clubs/${club.clubId}/races/create`)}>
          <Text style={styles.fabText}>+ Create Race Channel</Text>
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
  rowDate: { fontSize: 13, color: "#334155", marginTop: 4 },
  chevron: { fontSize: 20, color: "#94a3b8" },
  requested: { fontSize: 13, color: "#94a3b8", fontStyle: "italic" },
  requestButton: { backgroundColor: "#2563eb", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  requestButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
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
