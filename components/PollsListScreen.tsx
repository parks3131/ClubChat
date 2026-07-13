import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../constants/theme";
import { useAuth } from "../contexts/AuthProvider";
import { formatCountdown } from "../lib/dates";
import { fetchPolls, isPollEffectivelyClosed, type PollListItem, type PollScope } from "../lib/polls";
import { LoadError } from "./LoadError";

// Extracted so Race and Eboard polls can reuse the exact same screen
// instead of forking three more copies — the same payoff ChatScreen/
// HighlightsScreen already proved for chat (task #16). Design lifted from
// the founder's "Stitch Poll" export (club_polls/), re-skinned with this
// app's own theme tokens rather than the export's raw hex — same rule
// task #34 held to everywhere else.
interface Props {
  scope: PollScope;
  canCreate: boolean;
  createPath: string;
  pollPath: (pollId: string) => string;
}

export function PollsListScreen({ scope, canCreate, createPath, pollPath }: Props) {
  const { session } = useAuth();
  const router = useRouter();
  const [polls, setPolls] = useState<PollListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<"all" | "mine">("all");

  // A stable primitive key for the scope, since the wrapper screens pass a
  // fresh scope object literal on every render — using `scope` itself as a
  // dependency would recreate `load` (and re-fire useFocusEffect) every
  // render instead of only when the scope actually changes.
  const scopeKey = scope.type === "club" ? scope.clubId : scope.type === "race" ? scope.raceId : scope.eboardChannelId;

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    fetchPolls(scope, session.user.id)
      .then((data) => {
        setPolls(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey]);

  useFocusEffect(load);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return <LoadError message="Couldn't load polls." onRetry={load} />;
  }

  const visible = tab === "mine" ? polls.filter((p) => p.hasVoted) : polls;
  // Active polls first (by recency), then closed ones (by recency) — the
  // mockup has no section headers, but a months-old still-open poll
  // shouldn't bury yesterday's closed one, so this keeps that ordering
  // without literal "Active"/"Closed" section labels.
  const sorted = [...visible].sort((a, b) => {
    const aClosed = isPollEffectivelyClosed(a);
    const bClosed = isPollEffectivelyClosed(b);
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Community Voice</Text>
        <Text style={styles.headline}>Active Conversations</Text>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, tab === "all" && styles.tabButtonActive]}
          onPress={() => setTab("all")}
        >
          <Text style={[styles.tabText, tab === "all" && styles.tabTextActive]}>ALL POLLS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, tab === "mine" && styles.tabButtonActive]}
          onPress={() => setTab("mine")}
        >
          <Text style={[styles.tabText, tab === "mine" && styles.tabTextActive]}>MY VOTES</Text>
        </TouchableOpacity>
      </View>

      {sorted.length === 0 ? (
        <Text style={styles.empty}>{tab === "mine" ? "You haven't voted on anything yet." : "No polls yet."}</Text>
      ) : (
        <View style={styles.list}>
          {sorted.map((poll) => {
            const closed = isPollEffectivelyClosed(poll);
            return (
              <TouchableOpacity
                key={poll.id}
                style={[styles.card, closed && styles.cardClosed]}
                onPress={() => router.push(pollPath(poll.id))}
              >
                <View style={styles.cardTopRow}>
                  {closed ? (
                    <View style={styles.closedBadge}>
                      <MaterialIcons name="lock" size={12} color={colors.onSurface} />
                      <Text style={styles.closedBadgeText}>CLOSED</Text>
                    </View>
                  ) : (
                    <View style={styles.activeTag}>
                      <Text style={styles.activeTagText}>ACTIVE</Text>
                    </View>
                  )}
                  {!closed && poll.closesAt && (
                    <View style={styles.countdownBadge}>
                      <MaterialIcons name="timer" size={12} color={colors.inverseOnSurface} />
                      <Text style={styles.countdownText}>{formatCountdown(poll.closesAt)}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.voteCountRow}>
                  <MaterialIcons name={closed ? "group" : "poll"} size={18} color={closed ? colors.secondary : colors.primaryContainer} />
                  <Text style={[styles.voteCountText, closed && styles.voteCountTextClosed]}>
                    {poll.voteCount} VOTE{poll.voteCount === 1 ? "" : "S"}
                  </Text>
                </View>

                <Text style={styles.question}>{poll.question}</Text>

                {closed ? (
                  <View style={styles.viewResultsButton}>
                    <Text style={styles.viewResultsText}>VIEW RESULTS</Text>
                    <MaterialIcons name="assessment" size={16} color={colors.onSurfaceVariant} />
                  </View>
                ) : (
                  <View style={styles.voteNowButton}>
                    <Text style={styles.voteNowText}>VOTE NOW</Text>
                    <MaterialIcons name="chevron-right" size={18} color={colors.onPrimaryContainer} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {canCreate && (
        <View style={styles.ideaCard}>
          <View style={styles.ideaIconWrap}>
            <MaterialIcons name="add-chart" size={26} color={colors.onPrimary} />
          </View>
          <Text style={styles.ideaTitle}>Have a new idea?</Text>
          <Text style={styles.ideaBody}>
            Gather feedback from your teammates instantly. Create a poll to decide what's next.
          </Text>
          <TouchableOpacity style={styles.ideaButton} onPress={() => router.push(createPath)}>
            <Text style={styles.ideaButtonText}>CREATE POLL</Text>
          </TouchableOpacity>
        </View>
      )}

      {canCreate && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push(createPath)}>
          <MaterialIcons name="add" size={26} color={colors.onPrimary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: spacing.marginMobile, paddingTop: spacing.stackMd },
  eyebrow: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "uppercase" },
  headline: { ...typography.headlineLgMobile, fontSize: 24, color: colors.onSurface, marginTop: spacing.unit },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: spacing.unit,
    marginHorizontal: spacing.marginMobile,
    marginTop: spacing.stackMd,
  },
  tabButton: { flex: 1, paddingVertical: spacing.stackSm, borderRadius: radii.DEFAULT, alignItems: "center" },
  tabButtonActive: { backgroundColor: colors.surfaceContainerLowest },
  tabText: { ...typography.labelSm, color: colors.onSurfaceVariant },
  tabTextActive: { color: colors.primary },
  list: { padding: spacing.marginMobile, gap: spacing.gutter },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
    gap: spacing.stackSm,
  },
  cardClosed: { backgroundColor: colors.surfaceContainerLow, opacity: 0.92 },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  activeTag: { backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: spacing.stackSm, paddingVertical: 2 },
  activeTagText: { ...typography.labelSm, fontSize: 10, color: colors.onPrimary },
  closedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
  },
  closedBadgeText: { ...typography.labelSm, fontSize: 10, color: colors.onSurface },
  countdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.inverseSurface,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
  },
  countdownText: { ...typography.labelSm, fontSize: 10, color: colors.inverseOnSurface },
  voteCountRow: { flexDirection: "row", alignItems: "center", gap: spacing.unit + 2 },
  voteCountText: { ...typography.statValue, fontSize: 15, color: colors.onSurfaceVariant },
  voteCountTextClosed: { color: colors.secondary },
  question: { ...typography.headlineLgMobile, fontSize: 20, color: colors.onSurface, lineHeight: 26 },
  voteNowButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.unit + 2,
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.md,
    paddingVertical: spacing.stackSm + 4,
    marginTop: spacing.unit,
  },
  voteNowText: { ...typography.labelSm, fontSize: 13, color: colors.onPrimaryContainer },
  viewResultsButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.unit + 2,
    borderWidth: 2,
    borderColor: colors.outline,
    borderRadius: radii.md,
    paddingVertical: spacing.stackSm + 2,
    marginTop: spacing.unit,
  },
  viewResultsText: { ...typography.labelSm, fontSize: 13, color: colors.onSurfaceVariant },
  ideaCard: {
    marginHorizontal: spacing.marginMobile,
    marginTop: spacing.stackSm,
    marginBottom: spacing.stackLg,
    backgroundColor: colors.primaryFixed,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.stackMd,
    alignItems: "center",
    gap: spacing.stackSm,
  },
  ideaIconWrap: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "3deg" }],
  },
  ideaTitle: { ...typography.headlineLgMobile, fontSize: 18, color: colors.primary },
  ideaBody: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant, textAlign: "center" },
  ideaButton: { backgroundColor: colors.onSurface, borderRadius: radii.full, paddingHorizontal: spacing.stackMd, paddingVertical: spacing.stackSm + 4 },
  ideaButtonText: { ...typography.labelSm, fontSize: 13, color: colors.surface },
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
