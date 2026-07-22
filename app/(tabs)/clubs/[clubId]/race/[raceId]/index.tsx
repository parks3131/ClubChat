import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../../../../../../constants/theme";
import { useAuth } from "../../../../../../contexts/AuthProvider";
import { requestJoinRace } from "../../../../../../lib/races";
import { supabase } from "../../../../../../lib/supabase";
import { useRace } from "./_layout";

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
// branching for the not-yet-a-member states (name/date + Request to join,
// plus a way into the roster to manage/approve others without needing to
// join themselves first). Chat/Meet Info/Polls/Car Assignments no longer
// have a grid here — a member is bounced straight into chat, which reaches
// the other three via its own header quick-nav grid instead.
export default function RaceHubScreen() {
  const race = useRace();
  const router = useRouter();
  const { session } = useAuth();
  const [requesting, setRequesting] = useState(false);
  const [requestPending, setRequestPending] = useState(false);

  useEffect(() => {
    if (race.isMember) {
      router.replace(`/clubs/${race.clubId}/race/${race.raceId}/chat`);
    }
  }, [race.isMember, race.clubId, race.raceId, router]);

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

  // A member never actually sees this — the effect above replaces to
  // /chat before this would render anything meaningful.
  return (
    <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.marginMobile },
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
