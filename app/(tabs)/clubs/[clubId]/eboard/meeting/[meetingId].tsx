import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
          if (!cancelled) setMeeting(data);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [meetingId, eboard.channel])
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

  if (!eboard.channel?.isMember || loading || !meeting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
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
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 4 },
  title: { fontSize: 24, fontWeight: "700", color: "#0f172a", marginBottom: 16 },
  infoRow: { marginBottom: 12 },
  infoLabel: { fontSize: 12, fontWeight: "700", color: "#64748b", textTransform: "uppercase" },
  infoValue: { fontSize: 16, color: "#0f172a", marginTop: 2 },
  link: { fontSize: 16, color: "#2563eb", marginTop: 2, textDecorationLine: "underline" },
  descriptionBlock: { marginTop: 4, marginBottom: 12 },
  description: { fontSize: 15, color: "#334155", marginTop: 4, lineHeight: 21 },
  creator: { fontSize: 13, color: "#94a3b8", marginTop: 12 },
  actions: { flexDirection: "row", gap: 12, marginTop: 24 },
  editButton: { flex: 1, backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center" },
  editButtonText: { color: "#fff", fontWeight: "600" },
  deleteButton: { flex: 1, backgroundColor: "#fee2e2", borderRadius: 8, padding: 14, alignItems: "center" },
  deleteButtonText: { color: "#dc2626", fontWeight: "600" },
});
