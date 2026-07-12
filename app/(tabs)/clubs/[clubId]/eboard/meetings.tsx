import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
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

function bibDay(iso: string) {
  const d = new Date(iso);
  return { day: d.getDate(), month: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase() };
}

// Only a member can be here — index.tsx never links to /meetings
// otherwise, but a direct URL hit needs its own guard (same as chat.tsx).
export default function EboardMeetingsScreen() {
  const eboard = useEboard();
  const router = useRouter();
  const [meetings, setMeetings] = useState<EboardMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

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
          if (!cancelled) {
            setMeetings(data);
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
    }, [eboard.channel, retryToken])
  );

  if (!eboard.channel?.isMember || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return <LoadError message="Couldn't load meetings." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  const now = Date.now();
  const upcoming = meetings.filter((m) => new Date(m.meetingAt).getTime() >= now);
  const past = meetings.filter((m) => new Date(m.meetingAt).getTime() < now).reverse();

  const sections = [
    { title: "Upcoming", data: upcoming, faded: false },
    { title: "Past", data: past, faded: true },
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
            <Text style={[styles.sectionHeader, section.faded && styles.sectionHeaderFaded]}>{section.title}</Text>
            {section.data.map((meeting) => {
              const bib = bibDay(meeting.meetingAt);
              return (
                <TouchableOpacity
                  key={meeting.id}
                  style={[styles.row, section.faded && styles.rowFaded]}
                  onPress={() => router.push(`/clubs/${eboard.clubId}/eboard/meeting/${meeting.id}`)}
                >
                  <View style={styles.bibChip}>
                    <Text style={styles.bibDay}>{bib.day}</Text>
                    <Text style={styles.bibMonth}>{bib.month}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.badge}>MEETING</Text>
                    <Text style={styles.rowTitle}>{meeting.title}</Text>
                    <Text style={styles.rowDate}>{formatMeetingDate(meeting.meetingAt)}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push(`/clubs/${eboard.clubId}/eboard/meeting/create`)}
      >
        <MaterialIcons name="add" size={22} color={colors.onPrimaryContainer} />
      </TouchableOpacity>
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
    backgroundColor: colors.inverseSurface,
  },
  bibDay: { ...typography.statValue, fontSize: 22, lineHeight: 22, color: colors.inverseOnSurface },
  bibMonth: { ...typography.labelSm, fontSize: 10, marginTop: 2, color: colors.inverseOnSurface },
  rowBody: { flex: 1 },
  badge: {
    ...typography.labelSm,
    fontSize: 10,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
    overflow: "hidden",
    backgroundColor: colors.surfaceContainerHigh,
    color: colors.onSurfaceVariant,
    alignSelf: "flex-start",
  },
  rowTitle: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface, marginTop: spacing.stackSm },
  rowDate: { ...typography.bodyMd, fontSize: 13, color: colors.secondary, marginTop: 2 },
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
