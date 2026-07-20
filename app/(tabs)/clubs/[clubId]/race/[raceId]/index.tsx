import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography, type MaterialIconName } from "../../../../../../constants/theme";
import { useAuth } from "../../../../../../contexts/AuthProvider";
import { requestJoinRace } from "../../../../../../lib/races";
import { supabase } from "../../../../../../lib/supabase";
import { useRace } from "./_layout";

const SECTIONS: { key: string; label: string; subtitle: string; icon: MaterialIconName; tint: string }[] = [
  { key: "chat", label: "Chat", subtitle: "Jump into the conversation", icon: "forum", tint: colors.primary },
  { key: "location", label: "Meet Information", subtitle: "Location, hotel, photos & results", icon: "info", tint: colors.secondary },
  { key: "polls", label: "Polls", subtitle: "Vote on what's next", icon: "how-to-vote", tint: colors.secondary },
  { key: "carpool", label: "Car Assignments & Groups", subtitle: "Who's riding with who", icon: "directions-car", tint: colors.tertiary },
];

function formatEventDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Mirrors eboard/index.tsx's "visible to managers, membership is separate"
// branching: isMember gets the full hub unchanged; a manager who wasn't
// added sees name/date + Request to join, plus a way into the roster to
// manage/approve others without needing to join themselves first.
export default function RaceHubScreen() {
  const race = useRace();
  const router = useRouter();
  const { session } = useAuth();
  const [requesting, setRequesting] = useState(false);
  const [requestPending, setRequestPending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (race.isMember || !session) return;
      let cancelled = false;
      supabase
        .from("race_join_requests")
        .select("status")
        .eq("race_id", race.raceId)
        .eq("user_id", session.user.id)
        .eq("status", "pending")
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setRequestPending(!!data);
        });
      return () => {
        cancelled = true;
      };
    }, [race.isMember, race.raceId, session])
  );

  const handleRequest = async () => {
    setRequesting(true);
    try {
      await requestJoinRace(race.raceId);
      setRequestPending(true);
    } finally {
      setRequesting(false);
    }
  };

  if (!race.isMember) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBadge}>
            <MaterialIcons name="flag" size={28} color={colors.onPrimary} />
          </View>
          <Text style={styles.title}>{race.name}</Text>
          <Text style={styles.description}>{formatEventDate(race.eventDate)}</Text>
          {requestPending ? (
            <Text style={styles.requested}>Requested — waiting on an admin to approve.</Text>
          ) : (
            <TouchableOpacity style={styles.actionButton} disabled={requesting} onPress={handleRequest}>
              {requesting ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.actionButtonText}>Request to join</Text>
              )}
            </TouchableOpacity>
          )}
          {race.isManager && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push(`/clubs/${race.clubId}/race/${race.raceId}/roster`)}
            >
              <Text style={styles.secondaryButtonText}>Manage roster</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <Text style={styles.raceName}>{race.name.toUpperCase()}</Text>
        <Text style={styles.date}>{formatEventDate(race.eventDate)}</Text>
      </View>

      <View style={styles.grid}>
        {SECTIONS.map((section) => (
          <TouchableOpacity
            key={section.key}
            style={styles.card}
            onPress={() => router.push(`/clubs/${race.clubId}/race/${race.raceId}/${section.key}`)}
          >
            <View style={[styles.iconBadge, { backgroundColor: section.tint }]}>
              <MaterialIcons name={section.icon} size={22} color={colors.onPrimary} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardLabel}>{section.label.toUpperCase()}</Text>
              <Text style={styles.cardSubtitle}>{section.subtitle}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.marginMobile },
  identity: { alignItems: "center", marginBottom: spacing.gutter },
  raceName: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5, textAlign: "center" },
  date: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: spacing.unit },
  grid: { gap: spacing.stackSm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.gutter,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  iconBadge: { width: 44, height: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  cardTextWrap: { flex: 1 },
  cardLabel: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface },
  cardSubtitle: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 },
  emptyState: { alignItems: "center", marginTop: spacing.stackLg, gap: spacing.stackSm, paddingHorizontal: spacing.gutter },
  emptyIconBadge: {
    width: 56,
    height: 56,
    borderRadius: radii.xl,
    backgroundColor: colors.inverseSurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.stackSm,
  },
  title: { ...typography.headlineLgMobile, fontSize: 20, color: colors.onSurface, textAlign: "center" },
  description: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant, textAlign: "center" },
  requested: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, fontStyle: "italic", marginTop: spacing.unit },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 4,
    paddingHorizontal: spacing.gutter + 4,
    alignItems: "center",
    marginTop: spacing.stackSm,
  },
  actionButtonText: { ...typography.labelSm, fontSize: 13, color: colors.onPrimary, textTransform: "none" },
  secondaryButton: { paddingVertical: spacing.stackSm, paddingHorizontal: spacing.gutter, marginTop: spacing.unit },
  secondaryButtonText: { ...typography.labelSm, fontSize: 13, color: colors.primary, textTransform: "none" },
});
