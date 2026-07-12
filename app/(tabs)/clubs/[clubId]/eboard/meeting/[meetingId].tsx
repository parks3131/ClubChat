import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../../constants/theme";
import { useAuth } from "../../../../../../contexts/AuthProvider";
import { deleteMeeting, fetchMeeting, type EboardMeeting } from "../../../../../../lib/eboard";
import { useEboard } from "../_layout";

function formatMeetingDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MeetingDetailScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const eboard = useEboard();
  const { session } = useAuth();
  const router = useRouter();
  const [meeting, setMeeting] = useState<EboardMeeting | null>(null);
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
      fetchMeeting(meetingId)
        .then((data) => {
          if (!cancelled) {
            setMeeting(data);
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
    }, [meetingId, eboard.channel, retryToken])
  );

  const goBackToMeetings = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/clubs/${eboard.clubId}/eboard/meetings`);
    }
  };

  const handleDelete = () => {
    // react-native-web's Alert.alert is a no-op, so confirm via window.confirm there.
    if (Platform.OS === "web") {
      if (window.confirm("Delete this meeting? This can't be undone.")) {
        deleteMeeting(meetingId).then(goBackToMeetings);
      }
      return;
    }

    Alert.alert("Delete meeting?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteMeeting(meetingId);
          goBackToMeetings();
        },
      },
    ]);
  };

  if (eboard.channel?.isMember && loadError) {
    return <LoadError message="Couldn't load this meeting." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (!eboard.channel?.isMember || loading || !meeting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{meeting.title}</Text>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>When</Text>
        <Text style={styles.infoValue}>{formatMeetingDate(meeting.meetingAt)}</Text>
      </View>

      {meeting.meetingLink && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Link</Text>
          <TouchableOpacity onPress={() => Linking.openURL(meeting.meetingLink!)}>
            <Text style={styles.link}>{meeting.meetingLink}</Text>
          </TouchableOpacity>
        </View>
      )}

      {meeting.description && (
        <View style={styles.descriptionBlock}>
          <Text style={styles.infoLabel}>Details</Text>
          <Text style={styles.description}>{meeting.description}</Text>
        </View>
      )}

      <Text style={styles.creator}>Added by {meeting.createdByName}</Text>

      {meeting.createdBy === session?.user.id && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push(`/clubs/${eboard.clubId}/eboard/meeting/create?meetingId=${meetingId}`)}
          >
            <Text style={styles.editButtonText}>Edit</Text>
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
  title: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface, marginBottom: spacing.gutter },
  infoRow: { marginBottom: spacing.stackSm },
  infoLabel: { ...typography.labelSm, color: colors.onSurfaceVariant },
  infoValue: { ...typography.bodyMd, fontSize: 16, color: colors.onSurface, marginTop: 2 },
  link: { ...typography.bodyMd, fontSize: 16, color: colors.primary, marginTop: 2, textDecorationLine: "underline" },
  descriptionBlock: { marginTop: spacing.unit, marginBottom: spacing.stackSm },
  description: { ...typography.bodyMd, fontSize: 15, color: colors.onSurface, marginTop: spacing.unit, lineHeight: 21 },
  creator: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: spacing.stackSm },
  actions: { flexDirection: "row", gap: spacing.gutter, marginTop: spacing.stackMd },
  editButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radii.full, padding: spacing.stackSm + 6, alignItems: "center" },
  editButtonText: { ...typography.headlineLgMobile, fontSize: 16, color: colors.onPrimary },
  deleteButton: { flex: 1, backgroundColor: colors.errorContainer, borderRadius: radii.full, padding: spacing.stackSm + 6, alignItems: "center" },
  deleteButtonText: { ...typography.headlineLgMobile, fontSize: 16, color: colors.onErrorContainer },
});
