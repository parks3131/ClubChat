import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { deleteEvent, fetchEvent, type DisplayCalendarEvent } from "../../../../../lib/calendar";
import { useClub } from "../_layout";

const TYPE_LABELS: Record<string, string> = {
  race: "Race",
  practice: "Practice",
  team_bonding: "Team bonding",
  volunteer: "Volunteer",
  other: "Other",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EventDetailScreen() {
  const { clubId, eventId } = useLocalSearchParams<{ clubId: string; eventId: string }>();
  const club = useClub();
  const router = useRouter();
  const [event, setEvent] = useState<DisplayCalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchEvent(eventId)
        .then((data) => {
          if (!cancelled) setEvent(data);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [eventId])
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

  if (loading || !event) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.typeBadge}>{TYPE_LABELS[event.eventType]}</Text>
      <Text style={styles.title}>{event.title}</Text>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Starts</Text>
        <Text style={styles.infoValue}>{formatDateTime(event.startAt)}</Text>
      </View>

      {event.endAt && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ends</Text>
          <Text style={styles.infoValue}>{formatDateTime(event.endAt)}</Text>
        </View>
      )}

      {event.location && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Location</Text>
          <Text style={styles.infoValue}>{event.location}</Text>
        </View>
      )}

      {event.description && (
        <View style={styles.descriptionBlock}>
          <Text style={styles.infoLabel}>Details</Text>
          <Text style={styles.description}>{event.description}</Text>
        </View>
      )}

      <Text style={styles.creator}>Created by {event.createdByName}</Text>

      {club.role === "admin" && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push(`/clubs/${clubId}/event/create?eventId=${eventId}`)}
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
  typeBadge: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb",
    backgroundColor: "#dbeafe",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: "700", color: "#0f172a", marginBottom: 16 },
  infoRow: { marginBottom: 12 },
  infoLabel: { fontSize: 12, fontWeight: "700", color: "#64748b", textTransform: "uppercase" },
  infoValue: { fontSize: 16, color: "#0f172a", marginTop: 2 },
  descriptionBlock: { marginTop: 4, marginBottom: 12 },
  description: { fontSize: 15, color: "#334155", marginTop: 4, lineHeight: 21 },
  creator: { fontSize: 13, color: "#94a3b8", marginTop: 12 },
  actions: { flexDirection: "row", gap: 12, marginTop: 24 },
  editButton: { flex: 1, backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center" },
  editButtonText: { color: "#fff", fontWeight: "600" },
  deleteButton: { flex: 1, backgroundColor: "#fee2e2", borderRadius: 8, padding: 14, alignItems: "center" },
  deleteButtonText: { color: "#dc2626", fontWeight: "600" },
});
