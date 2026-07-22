import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { colors, spacing } from "../constants/theme";
import { useAuth } from "../contexts/AuthProvider";
import { castVote, deletePoll, fetchPoll, setPollClosed, type PollDetail } from "../lib/polls";
import { reportError } from "../lib/reportError";
import { LoadError } from "./LoadError";
import { PollCard } from "./PollCard";

interface Props {
  pollId: string;
  backPath: string;
}

// Thin wrapper around the shared PollCard (the same view ChatScreen's
// inline poll bubble renders, per a founder request that chat shouldn't
// need a "View Poll" link-out for anything — see PollCard.tsx) — this
// screen's own job is just load/reload plumbing and post-action
// navigation (goBack after delete), which is specific to being a full
// screen rather than a chat bubble.
export function PollDetailScreen({ pollId, backPath }: Props) {
  const { session } = useAuth();
  const router = useRouter();
  const [poll, setPoll] = useState<PollDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    fetchPoll(pollId, session.user.id)
      .then((data) => {
        setPoll(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [pollId, session]);

  useFocusEffect(load);

  const closed = poll ? poll.isClosed || (poll.closesAt !== null && new Date(poll.closesAt).getTime() <= Date.now()) : false;

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

  const handleDelete = async () => {
    try {
      await deletePoll(pollId);
      goBack();
    } catch (err) {
      reportError(err);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load this poll." onRetry={load} />;
  }

  if (loading || !poll || !session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <PollCard
        poll={poll}
        currentUserId={session.user.id}
        votingOptionId={votingOptionId}
        onVote={handleVote}
        onToggleClosed={handleToggleClosed}
        onDelete={handleDelete}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.marginMobile },
});
