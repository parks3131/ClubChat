import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../components/LoadError";
import { useAuth } from "../../../../contexts/AuthProvider";
import { fetchCalendarFeed, type CalendarFeedItem } from "../../../../lib/calendarFeed";
import { toDateKey } from "../../../../lib/dates";
import { useClub } from "./_layout";

function formatItemDate(item: CalendarFeedItem) {
  if (item.hasTime) {
    return new Date(item.atIso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  // Date-only (races) — build from y/m/d components rather than
  // `new Date(iso)`, which parses as UTC midnight and can display a day
  // early in timezones behind UTC (same bug formatDateOfBirth was fixed
  // for — see SPEC.md section 6).
  const [year, month, day] = item.atIso.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Merges calendar_events, races you have access to, and Eboard meetings
// (if you're a member) into one date-ordered feed — see
// lib/calendarFeed.ts for the per-source visibility rules. "Upcoming" vs
// "Past" preserves each source's own existing cutoff convention rather
// than one blunt timestamp comparison: a race stays "Upcoming" all day
// today (date-string compare, matching races/index.tsx), while events/
// meetings use a real timestamp compare.
export default function ClubCalendarScreen() {
  const club = useClub();
  const { session } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CalendarFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      setLoading(true);
      fetchCalendarFeed(club.clubId, session.user.id, club.role === "admin")
        .then((data) => {
          if (!cancelled) {
            setItems(data);
            setLoadError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [club.clubId, club.role, session, retryToken])
  );

  const now = Date.now();
  const todayKey = toDateKey(new Date());
  const isUpcoming = (item: CalendarFeedItem) =>
    item.hasTime ? new Date(item.atIso).getTime() >= now : item.atIso.slice(0, 10) >= todayKey;

  const upcoming = items.filter(isUpcoming);
  const past = items.filter((i) => !isUpcoming(i)).reverse();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (loadError) {
    return <LoadError message="Couldn't load the calendar." onRetry={() => setRetryToken((t) => t + 1)} />;
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
            {section.data.map((item) => (
              <TouchableOpacity key={item.id} style={styles.row} onPress={() => router.push(item.path)}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.typeBadge}>{item.badgeLabel}</Text>
                </View>
                <Text style={styles.rowDate}>{formatItemDate(item)}</Text>
                {item.subtitle && <Text style={styles.rowLocation}>{item.subtitle}</Text>}
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
