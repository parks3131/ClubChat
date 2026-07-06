import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { useAuth } from "../../../../../contexts/AuthProvider";
import {
  castVote,
  deletePoll,
  fetchPoll,
  fetchPollVoters,
  setPollClosed,
  type PollDetail,
} from "../../../../../lib/polls";
import { reportError } from "../../../../../lib/reportError";
import { useClub } from "../_layout";

export default function PollDetailScreen() {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  const club = useClub();
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

  const handleVote = async (optionId: string) => {
    if (!poll || poll.isClosed) return;
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

  const goBackToList = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/clubs/${club.clubId}/polls`);
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
        deletePoll(pollId).then(goBackToList).catch(reportError);
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
            goBackToList();
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
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {poll.isClosed && <Text style={styles.closedBadge}>Closed</Text>}
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
            disabled={poll.isClosed || votingOptionId === option.id}
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
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 4 },
  closedBadge: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    backgroundColor: "#e2e8f0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  question: { fontSize: 22, fontWeight: "700", color: "#0f172a" },
  meta: { fontSize: 13, color: "#64748b", marginTop: 6, marginBottom: 16 },
  optionsBlock: { gap: 8 },
  optionRow: { backgroundColor: "#f1f5f9", borderRadius: 10, padding: 14 },
  optionRowSelected: { backgroundColor: "#dbeafe" },
  optionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  optionText: { fontSize: 16, fontWeight: "600", color: "#0f172a", flexShrink: 1 },
  optionCount: { fontSize: 15, fontWeight: "700", color: "#2563eb" },
  voterNames: { fontSize: 12, color: "#64748b", marginTop: 6 },
  privateNote: { fontSize: 12, color: "#94a3b8", fontStyle: "italic", marginTop: 12 },
  actions: { flexDirection: "row", gap: 12, marginTop: 24 },
  closeButton: { flex: 1, backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center" },
  closeButtonText: { color: "#fff", fontWeight: "600" },
  deleteButton: { flex: 1, backgroundColor: "#fee2e2", borderRadius: 8, padding: 14, alignItems: "center" },
  deleteButtonText: { color: "#dc2626", fontWeight: "600" },
});
