import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../../components/LoadError";
import {
  ACTIVITY_LABELS,
  deleteWorkout,
  fetchWorkout,
  type DisplayRoutineWorkout,
} from "../../../../../../lib/routines";
import { useClub } from "../../_layout";

function formatDate(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function WorkoutDetailScreen() {
  const { clubId, workoutId } = useLocalSearchParams<{ clubId: string; workoutId: string }>();
  const club = useClub();
  const router = useRouter();
  const [workout, setWorkout] = useState<DisplayRoutineWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchWorkout(workoutId)
        .then((data) => {
          if (!cancelled) {
            setWorkout(data);
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
    }, [workoutId, retryToken])
  );

  const goBackToRoutines = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/clubs/${clubId}/routines`);
    }
  };

  const handleDelete = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Delete this workout? This can't be undone.")) {
        deleteWorkout(workoutId).then(goBackToRoutines);
      }
      return;
    }

    Alert.alert("Delete workout?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteWorkout(workoutId);
          goBackToRoutines();
        },
      },
    ]);
  };

  if (loadError) {
    return <LoadError message="Couldn't load this workout." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (loading || !workout) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.typeBadge}>{ACTIVITY_LABELS[workout.activityType]}</Text>
      <Text style={styles.title}>{workout.title}</Text>
      <Text style={styles.date}>{formatDate(workout.workoutDate)}</Text>

      {workout.description && <Text style={styles.description}>{workout.description}</Text>}

      {club.isAdmin && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push(`/clubs/${clubId}/routines/workout/create?workoutId=${workoutId}`)}
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
  title: { fontSize: 24, fontWeight: "700", color: "#0f172a" },
  date: { fontSize: 14, color: "#64748b", marginTop: 4, marginBottom: 12 },
  description: { fontSize: 15, color: "#334155", lineHeight: 21, marginBottom: 12 },
  actions: { flexDirection: "row", gap: 12, marginTop: 24 },
  editButton: { flex: 1, backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center" },
  editButtonText: { color: "#fff", fontWeight: "600" },
  deleteButton: { flex: 1, backgroundColor: "#fee2e2", borderRadius: 8, padding: 14, alignItems: "center" },
  deleteButtonText: { color: "#dc2626", fontWeight: "600" },
});
