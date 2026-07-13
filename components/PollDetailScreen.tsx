import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../constants/theme";
import { useAuth } from "../contexts/AuthProvider";
import { formatCountdown } from "../lib/dates";
import {
  castVote,
  deletePoll,
  fetchPoll,
  fetchPollVoters,
  isPollEffectivelyClosed,
  setPollClosed,
  type PollDetail,
} from "../lib/polls";
import { reportError } from "../lib/reportError";
import { LoadError } from "./LoadError";

interface Props {
  pollId: string;
  backPath: string;
}

export function PollDetailScreen({ pollId, backPath }: Props) {
  const { session } = useAuth();
  const router = useRouter();
  const [poll, setPoll] = useState<PollDetail | null>(null);
  const [voters, setVoters] = useState<Record<string, { userId: string; fullName: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    fetchPoll(pollId, session.user.id)
      .then(async (data) => {
        setPoll(data);
        if (!data.isPrivate || data.createdBy === session.user.id) {
          const voterMap = await fetchPollVoters(pollId);
          setVoters(voterMap);
        } else {
          setVoters({});
        }
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [pollId, session]);

  useFocusEffect(load);

  const isCreator = poll?.createdBy === session?.user.id;
  const canSeeVoters = !!poll && (!poll.isPrivate || isCreator);
  const closed = poll ? isPollEffectivelyClosed(poll) : false;

  const handleVote = async (optionId: string) => {
    if (!poll || closed) return;
    setVotingOptionId(optionId);
    try {
      await castVote(optionId);
      load();
    } catch (err) {
      reportError(err);
    } finally {
      setVotingOptionId(null);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(backPath);
    }
  };

  const handleToggleClosed = async () => {
    if (!poll) return;
    try {
      await setPollClosed(poll.id, !poll.isClosed);
      load();
    } catch (err) {
      reportError(err);
    }
  };

  const handleDelete = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Delete this poll? This can't be undone.")) {
        deletePoll(pollId).then(goBack).catch(reportError);
      }
      return;
    }

    Alert.alert("Delete poll?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePoll(pollId);
            goBack();
          } catch (err) {
            reportError(err);
          }
        },
      },
    ]);
  };

  if (loadError) {
    return <LoadError message="Couldn't load this poll." onRetry={load} />;
  }

  if (loading || !poll) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statusRow}>
        {closed ? (
          <View style={styles.closedBadge}>
            <MaterialIcons name="lock" size={12} color={colors.onSurface} />
            <Text style={styles.closedBadgeText}>{poll.isClosed ? "CLOSED" : "ENDED"}</Text>
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

      <Text style={styles.question}>{poll.question}</Text>
      <Text style={styles.meta}>
        Created by {poll.createdByName} · {poll.allowMultiple ? "Multiple choice" : "Single choice"}
        {poll.isPrivate ? " · Private vote" : ""}
      </Text>

      <View style={styles.optionsBlock}>
        {poll.options.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[styles.optionRow, option.votedByMe && styles.optionRowSelected]}
            disabled={closed || votingOptionId === option.id}
            onPress={() => handleVote(option.id)}
          >
            <View style={styles.optionHeader}>
              <Text style={styles.optionText}>
                {option.votedByMe ? "✓ " : ""}
                {option.text}
              </Text>
              <Text style={styles.optionCount}>{option.voteCount}</Text>
            </View>
            {canSeeVoters && voters[option.id] && voters[option.id].length > 0 && (
              <Text style={styles.voterNames}>{voters[option.id].map((v) => v.fullName).join(", ")}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {poll.isPrivate && !isCreator && (
        <Text style={styles.privateNote}>This is a private vote — only {poll.createdByName} can see who voted for what.</Text>
      )}

      {isCreator && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.closeButton} onPress={handleToggleClosed}>
            <Text style={styles.closeButtonText}>{poll.isClosed ? "Reopen Poll" : "Close Poll"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.marginMobile, gap: spacing.unit },
  statusRow: { flexDirection: "row", gap: spacing.stackSm, marginBottom: spacing.stackSm },
  activeTag: { backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: spacing.stackSm, paddingVertical: 2, alignSelf: "flex-start" },
  activeTagText: { ...typography.labelSm, fontSize: 10, color: colors.onPrimary },
  closedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
    alignSelf: "flex-start",
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
    alignSelf: "flex-start",
  },
  countdownText: { ...typography.labelSm, fontSize: 10, color: colors.inverseOnSurface },
  question: { ...typography.headlineLgMobile, fontSize: 24, color: colors.onSurface },
  meta: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: spacing.stackSm, marginBottom: spacing.stackMd },
  optionsBlock: { gap: spacing.stackSm },
  optionRow: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  optionRowSelected: { backgroundColor: colors.primaryFixed, borderColor: colors.primary },
  optionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  optionText: { ...typography.bodyMd, fontWeight: "700", fontSize: 16, color: colors.onSurface, flexShrink: 1 },
  optionCount: { ...typography.statValue, fontSize: 16, color: colors.primaryContainer },
  voterNames: { ...typography.labelSm, fontSize: 11, color: colors.onSurfaceVariant, marginTop: spacing.stackSm, textTransform: "none" },
  privateNote: { ...typography.bodyMd, fontSize: 12, color: colors.onSurfaceVariant, fontStyle: "italic", marginTop: spacing.stackMd },
  actions: { flexDirection: "row", gap: spacing.gutter, marginTop: spacing.stackMd + 4 },
  closeButton: { flex: 1, backgroundColor: colors.primaryContainer, borderRadius: radii.md, padding: spacing.gutter, alignItems: "center" },
  closeButtonText: { ...typography.labelSm, fontSize: 13, color: colors.onPrimaryContainer },
  deleteButton: { flex: 1, backgroundColor: colors.errorContainer, borderRadius: radii.md, padding: spacing.gutter, alignItems: "center" },
  deleteButtonText: { ...typography.labelSm, fontSize: 13, color: colors.onErrorContainer },
});
