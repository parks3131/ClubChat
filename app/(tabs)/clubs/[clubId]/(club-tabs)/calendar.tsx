import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fetchEvents, type DisplayCalendarEvent } from "../../../../../lib/calendar";
import { useClub } from "../_layout";

const TYPE_LABELS: Record<string, string> = {
  race: "Race",
  practice: "Practice",
  team_bonding: "Team bonding",
  volunteer: "Volunteer",
  other: "Other",
};

function formatEventDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ClubCalendarScreen() {
  const club = useClub();
  const router = useRouter();
  const [events, setEvents] = useState<DisplayCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchEvents(club.clubId)
        .then((data) => {
          if (!cancelled) setEvents(data);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [club.clubId])
  );

  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.startAt).getTime() >= now);
  const past = events.filter((e) => new Date(e.startAt).getTime() < now).reverse();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

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
        ListEmptyComponent={<Text style={styles.empty}>No events yet.</Text>}
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.sectionHeader}>{section.title}</Text>
            {section.data.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={styles.row}
                onPress={() => router.push(`/clubs/${club.clubId}/event/${event.id}`)}
              >
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle}>{event.title}</Text>
                  <Text style={styles.typeBadge}>{TYPE_LABELS[event.eventType]}</Text>
                </View>
                <Text style={styles.rowDate}>{formatEventDate(event.startAt)}</Text>
                {event.location && <Text style={styles.rowLocation}>{event.location}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}
      />

      {club.role === "admin" && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push(`/clubs/${club.clubId}/event/create`)}>
          <Text style={styles.fabText}>+ New Event</Text>
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
  sectionHeader: { fontSize: 13, fontWeight: "700", color: "#64748b", marginTop: 12, marginBottom: 6, textTransform: "uppercase" },
  row: { backgroundColor: "#f1f5f9", borderRadius: 10, padding: 12, marginBottom: 8 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", flexShrink: 1 },
  typeBadge: { fontSize: 12, fontWeight: "600", color: "#2563eb", backgroundColor: "#dbeafe", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  rowDate: { fontSize: 13, color: "#334155", marginTop: 4 },
  rowLocation: { fontSize: 13, color: "#64748b", marginTop: 2 },
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
