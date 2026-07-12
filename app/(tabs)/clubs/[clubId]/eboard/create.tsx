import { useRouter } from "expo-router";
import { useState } from "react";
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
import { createEboardChannel } from "../../../../../lib/eboard";
import { useEboard } from "./_layout";

export default function CreateEboardScreen() {
  const eboard = useEboard();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    try {
      await createEboardChannel({
        clubId: eboard.clubId,
        name: name.trim(),
        description: description.trim() || null,
        createdBy: eboard.userId,
      });
      await eboard.reload();
      router.replace(`/clubs/${eboard.clubId}/eboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>New Eboard & Council</Text>
        <Text style={styles.subtitle}>A private space for club admins, separate from the main club chat.</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Eboard"
          placeholderTextColor={colors.onSurfaceVariant}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="What this channel is for"
          placeholderTextColor={colors.onSurfaceVariant}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
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
  multiline: { minHeight: 80, textAlignVertical: "top" },
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
