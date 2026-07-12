import { useRouter } from "expo-router";
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
} from "react-native";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { useAuth } from "../../../../../contexts/AuthProvider";
import { createRace } from "../../../../../lib/races";
import { useClub } from "../_layout";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function CreateRaceScreen() {
  const club = useClub();
  const { session } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (club.role !== "admin") {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/clubs/${club.clubId}/races`);
      }
    }
  }, [club.role, club.clubId, router]);

  const handleSave = async () => {
    if (!session) return;
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!DATE_RE.test(eventDate.trim())) {
      setError("Date must be YYYY-MM-DD.");
      return;
    }

    setSaving(true);
    try {
      const created = await createRace({
        clubId: club.clubId,
        name: name.trim(),
        eventDate: eventDate.trim(),
        createdBy: session.user.id,
      });
      router.replace(`/clubs/${club.clubId}/race/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>New Race Channel</Text>
        <Text style={styles.subtitle}>Standalone from the calendar — its own chat, roster, and meet info.</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Nittany Lion Invitational"
          placeholderTextColor={colors.onSurfaceVariant}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.onSurfaceVariant}
          value={eventDate}
          onChangeText={setEventDate}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.saveButtonText}>Create</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.marginMobile, gap: spacing.stackSm },
  title: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface },
  subtitle: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant, marginTop: -spacing.unit },
  label: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "uppercase", marginTop: spacing.stackSm },
  input: {
    ...typography.bodyMd,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm + 6,
  },
  error: { color: colors.error, marginTop: spacing.stackSm },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 8,
    alignItems: "center",
    marginTop: spacing.gutter,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onPrimary },
});
