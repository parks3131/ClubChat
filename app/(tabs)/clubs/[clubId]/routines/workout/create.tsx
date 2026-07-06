import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LoadError } from "../../../../../../components/LoadError";
import { useAuth } from "../../../../../../contexts/AuthProvider";
import { ACTIVITY_LABELS, createWorkout, fetchWorkout, updateWorkout } from "../../../../../../lib/routines";
import type { RoutineActivityType } from "../../../../../../types/database";
import { useClub } from "../../_layout";

export default function CreateOrEditWorkoutScreen() {
  const { clubId, workoutId, date, activityType: activityTypeParam } = useLocalSearchParams<{
    clubId: string;
    workoutId?: string;
    date?: string;
    activityType?: RoutineActivityType;
  }>();
  const club = useClub();
  const { session } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const isEditing = !!workoutId;

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? "Edit workout" : "New workout" });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (club.role !== "admin") {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/clubs/${clubId}/routines`);
      }
    }
  }, [club.role, router, clubId]);

  const [activityType, setActivityType] = useState<RoutineActivityType>(activityTypeParam ?? "run");
  const [workoutDate, setWorkoutDate] = useState(date ?? "");
  const [title, setTitle] = useState(activityTypeParam ? ACTIVITY_LABELS[activityTypeParam] : "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    setLoading(true);
    fetchWorkout(workoutId!)
      .then((existing) => {
        if (!existing) return;
        setActivityType(existing.activityType);
        setWorkoutDate(existing.workoutDate);
        setTitle(existing.title);
        setDescription(existing.description ?? "");
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [isEditing, workoutId, retryToken]);

  const handleSave = async () => {
    if (!session) return;
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateWorkout(workoutId!, {
          title: title.trim(),
          description: description.trim(),
        });
        router.replace(`/clubs/${clubId}/routines/workout/${workoutId}`);
      } else {
        const createdId = await createWorkout({
          clubId: club.clubId,
          workoutDate: workoutDate,
          activityType,
          title: title.trim(),
          description: description.trim(),
          createdBy: session.user.id,
        });
        router.replace(`/clubs/${clubId}/routines/workout/${createdId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load this workout." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.activityBadge}>{ACTIVITY_LABELS[activityType]}</Text>

        <TextInput style={styles.input} placeholder="Workout title" value={title} onChangeText={setTitle} />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Add description"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 12 },
  activityBadge: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb",
    backgroundColor: "#dbeafe",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 14, fontSize: 16 },
  multiline: { height: 90, textAlignVertical: "top" },
  error: { color: "#dc2626", textAlign: "center" },
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
