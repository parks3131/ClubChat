import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { useAuth } from "../../../../../contexts/AuthProvider";
import { toDateKey } from "../../../../../lib/dates";
import { fetchRaces, requestJoinRace, type RaceListItem } from "../../../../../lib/races";
import { useClub } from "../_layout";

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

function bibDay(dateKey: string) {
  const [, month, day] = dateKey.split("-").map(Number);
  return { day, month: new Date(2000, month - 1, 1).toLocaleDateString(undefined, { month: "short" }).toUpperCase() };
}

export default function RacesListScreen() {
  const club = useClub();
  const router = useRouter();
  const { session } = useAuth();
  const [races, setRaces] = useState<RaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    fetchRaces(club.clubId, session.user.id, club.isAdmin)
      .then((data) => {
        setRaces(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [club.clubId, club.role, session]);

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
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return <LoadError message="Couldn't load races & meets." onRetry={load} />;
  }

  const todayKey = toDateKey(new Date());
  const upcoming = races.filter((r) => r.eventDate >= todayKey);
  const finished = races.filter((r) => r.eventDate < todayKey).reverse();

  const sections = [
    { title: "Upcoming", data: upcoming, faded: false },
    { title: "Finished", data: finished, faded: true },
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
            <Text style={[styles.sectionHeader, section.faded && styles.sectionHeaderFaded]}>{section.title}</Text>
            {section.data.map((race) => {
              const canEnter = race.access !== "none";
              const bib = bibDay(race.eventDate);
              return (
                <TouchableOpacity
                  key={race.id}
                  style={[styles.row, section.faded && styles.rowFaded]}
                  onPress={() =>
                    router.push(
                      canEnter
                        ? `/clubs/${club.clubId}/race/${race.id}`
                        : `/clubs/${club.clubId}/races/${race.id}`
                    )
                  }
                >
                  <View style={styles.bibChip}>
                    <Text style={styles.bibDay}>{bib.day}</Text>
                    <Text style={styles.bibMonth}>{bib.month}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.badge}>RACE</Text>
                    <Text style={styles.rowTitle}>{race.name}</Text>
                    <Text style={styles.rowDate}>{formatEventDate(race.eventDate)}</Text>
                  </View>
                  {canEnter ? (
                    <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
                  ) : race.requestStatus === "pending" ? (
                    <Text style={styles.requested}>Requested</Text>
                  ) : (
                    <TouchableOpacity
                      style={styles.requestButton}
                      disabled={requesting === race.id}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleRequest(race.id);
                      }}
                    >
                      <Text style={styles.requestButtonText}>
                        {requesting === race.id ? "Requesting…" : "Request"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      />

      {club.isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push(`/clubs/${club.clubId}/races/create`)}>
          <MaterialIcons name="add" size={22} color={colors.onPrimaryContainer} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.marginMobile, paddingBottom: 80 },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant },
  sectionHeader: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onSurface, marginTop: spacing.stackSm, marginBottom: spacing.stackSm },
  sectionHeaderFaded: { opacity: 0.5 },
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
  rowFaded: { opacity: 0.6 },
  bibChip: {
    width: 52,
    height: 60,
    borderRadius: radii.DEFAULT,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  bibDay: { ...typography.statValue, fontSize: 22, lineHeight: 22, color: colors.onPrimary },
  bibMonth: { ...typography.labelSm, fontSize: 10, marginTop: 2, color: colors.onPrimary },
  rowBody: { flex: 1 },
  badge: {
    ...typography.labelSm,
    fontSize: 10,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
    overflow: "hidden",
    backgroundColor: colors.primaryFixed,
    color: colors.onPrimaryFixedVariant,
    alignSelf: "flex-start",
  },
  rowTitle: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface, marginTop: spacing.stackSm, flexShrink: 1 },
  rowDate: { ...typography.bodyMd, fontSize: 13, color: colors.secondary, marginTop: 2 },
  requested: { ...typography.labelSm, fontSize: 11, color: colors.onSurfaceVariant, fontStyle: "italic", textTransform: "none" },
  requestButton: { backgroundColor: colors.primary, borderRadius: radii.full, paddingHorizontal: spacing.stackSm + 4, paddingVertical: spacing.unit + 2 },
  requestButtonText: { ...typography.labelSm, fontSize: 11, color: colors.onPrimary, textTransform: "none" },
  fab: {
    position: "absolute",
    right: spacing.marginMobile,
    bottom: spacing.marginMobile,
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
});
