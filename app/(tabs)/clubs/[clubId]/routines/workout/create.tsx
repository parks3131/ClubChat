import { MaterialIcons } from "@expo/vector-icons";
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
import { colors, radii, spacing, typography } from "../../../../../../constants/theme";
import { useAuth } from "../../../../../../contexts/AuthProvider";
import { isPastDateOnly } from "../../../../../../lib/dates";
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
    if (!club.isAdmin) {
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
    // workoutDate is only ever set here on create (seeded from the day
    // card's `?date=` param and never resubmitted on edit — see
    // updateWorkout below), so this only needs to guard the create path.
    if (!isEditing && isPastDateOnly(workoutDate)) {
      setError("Workout date can't be in the past.");
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
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.eyebrowRow}>
          <MaterialIcons name="add" size={16} color={colors.onSurfaceVariant} />
          <Text style={styles.eyebrow}>{isEditing ? "Edit Workout" : "New Workout"}</Text>
        </View>

        <Text style={styles.activityBadge}>{ACTIVITY_LABELS[activityType].toUpperCase()}</Text>

        <TextInput
          style={styles.titleInput}
          placeholder={ACTIVITY_LABELS[activityType].toUpperCase()}
          placeholderTextColor={colors.outline}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Add description"
          placeholderTextColor={colors.onSurfaceVariant}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>SAVE WORKOUT</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.marginMobile, gap: spacing.stackMd },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.unit + 2 },
  eyebrow: { ...typography.labelSm, fontSize: 13, color: colors.onSurfaceVariant, textTransform: "uppercase" },
  activityBadge: {
    alignSelf: "flex-start",
    ...typography.labelSm,
    fontSize: 10,
    color: colors.onPrimaryFixedVariant,
    backgroundColor: colors.primaryFixed,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
  },
  titleInput: {
    ...typography.displayXl,
    fontSize: 40,
    lineHeight: 46,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.DEFAULT,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.gutter,
  },
  input: {
    ...typography.bodyMd,
    fontSize: 16,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.DEFAULT,
    padding: spacing.gutter,
  },
  multiline: { height: 120, textAlignVertical: "top", fontSize: 17 },
  error: { color: colors.error, textAlign: "center" },
  footer: {
    padding: spacing.marginMobile,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  button: { backgroundColor: colors.primary, borderRadius: radii.DEFAULT, padding: spacing.gutter, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.headlineLgMobile, fontSize: 20, color: colors.onPrimary },
});
