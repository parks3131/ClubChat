import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { deleteEvent, fetchEvent, type DisplayCalendarEvent } from "../../../../../lib/calendar";
import { useClub } from "../_layout";

const TYPE_LABELS: Record<string, string> = {
  race: "Race",
  practice: "Practice",
  team_bonding: "Team bonding",
  volunteer: "Volunteer",
  other: "Other",
};

// Compact "AUG 24 • 08:30 AM" stat format, matching this app's existing
// inline-formatter convention (calendar.tsx/routines/index.tsx etc. each
// call toLocaleDateString(undefined, { month: "short" }) locally rather
// than sharing a helper) — not the long-form sentence formatDateTime
// produced before, which reads as body text, not a stat card value.
function formatEventStat(iso: string) {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
  const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toUpperCase();
  return `${datePart} • ${timePart}`;
}

export default function EventDetailScreen() {
  const { clubId, eventId } = useLocalSearchParams<{ clubId: string; eventId: string }>();
  const club = useClub();
  const router = useRouter();
  const [event, setEvent] = useState<DisplayCalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchEvent(eventId)
        .then((data) => {
          if (!cancelled) {
            setEvent(data);
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
    }, [eventId, retryToken])
  );

  const goBackToCalendar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/clubs/${clubId}/calendar`);
    }
  };

  const handleDelete = () => {
    // react-native-web's Alert.alert is a no-op, so confirm via window.confirm there.
    if (Platform.OS === "web") {
      if (window.confirm("Delete this event? This can't be undone.")) {
        deleteEvent(eventId).then(goBackToCalendar);
      }
      return;
    }

    Alert.alert("Delete event?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteEvent(eventId);
          goBackToCalendar();
        },
      },
    ]);
  };

  if (loadError) {
    return <LoadError message="Couldn't load this event." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (loading || !event) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.typeBadge}>{TYPE_LABELS[event.eventType].toUpperCase()}</Text>
      <Text style={styles.title}>{event.title.toUpperCase()}</Text>

      <View style={styles.statGrid}>
        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <MaterialIcons name="schedule" size={18} color={colors.primary} />
            <Text style={styles.statLabel}>Starts</Text>
          </View>
          <Text style={styles.statValue}>{formatEventStat(event.startAt)}</Text>
        </View>

        {event.endAt && (
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <MaterialIcons name="schedule" size={18} color={colors.primary} />
              <Text style={styles.statLabel}>Ends</Text>
            </View>
            <Text style={styles.statValue}>{formatEventStat(event.endAt)}</Text>
          </View>
        )}

        {event.location && (
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <MaterialIcons name="location-on" size={18} color={colors.primary} />
              <Text style={styles.statLabel}>Location</Text>
            </View>
            <Text style={styles.statValue}>{event.location.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {event.description && (
        <View style={styles.descriptionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Details</Text>
            <View style={styles.sectionHeaderLine} />
          </View>
          <Text style={styles.description}>{event.description}</Text>
        </View>
      )}

      <Text style={styles.creator}>Created by {event.createdByName}</Text>

      {club.isAdmin && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push(`/clubs/${clubId}/event/create?eventId=${eventId}`)}
          >
            <MaterialIcons name="edit" size={18} color={colors.onTertiaryContainer} />
            <Text style={styles.editButtonText}>EDIT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <MaterialIcons name="delete" size={22} color={colors.onErrorContainer} />
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.marginMobile, gap: spacing.stackSm },
  typeBadge: {
    alignSelf: "flex-start",
    ...typography.labelSm,
    color: colors.onPrimaryContainer,
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm - 2,
    letterSpacing: 1,
    marginBottom: spacing.stackSm,
  },
  title: { ...typography.displayXl, fontSize: 34, color: colors.onSurface, marginBottom: spacing.stackMd },
  statGrid: { gap: spacing.stackSm, marginBottom: spacing.stackSm },
  statCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
    borderRadius: radii.lg,
    padding: spacing.gutter,
    gap: spacing.stackSm,
  },
  statHeader: { flexDirection: "row", alignItems: "center", gap: spacing.unit + 2 },
  statLabel: { ...typography.labelSm, color: colors.primary, letterSpacing: 1 },
  statValue: { ...typography.statValue, color: colors.onSurface },
  descriptionBlock: { marginTop: spacing.stackMd, marginBottom: spacing.stackSm },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.gutter, marginBottom: spacing.stackSm },
  sectionHeader: { ...typography.headlineLgMobile, fontSize: 20, color: colors.onSurfaceVariant },
  sectionHeaderLine: { flex: 1, height: 2, backgroundColor: colors.outlineVariant, opacity: 0.5 },
  description: { ...typography.bodyMd, color: colors.onSurface },
  creator: { ...typography.labelSm, color: colors.outline, marginTop: spacing.stackMd, textTransform: "none" },
  actions: { flexDirection: "row", gap: spacing.gutter, marginTop: spacing.stackMd },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.stackSm,
    backgroundColor: colors.tertiaryContainer,
    borderRadius: radii.lg,
    padding: spacing.gutter,
  },
  editButtonText: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onTertiaryContainer, letterSpacing: 1 },
  deleteButton: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.errorContainer,
    borderRadius: radii.lg,
  },
});
