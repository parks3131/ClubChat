import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../constants/theme";
import { useAuth } from "../contexts/AuthProvider";
import { createPoll, type PollScope } from "../lib/polls";
import { ThemedSwitch } from "./ThemedSwitch";

const MAX_OPTIONS = 10;

type EndsChoice = "none" | "1d" | "3d" | "1w" | "custom";
type CustomUnit = "minutes" | "hours" | "days";

const CHOICE_TO_DAYS: Record<Exclude<EndsChoice, "none" | "custom">, number> = {
  "1d": 1,
  "3d": 3,
  "1w": 7,
};

const UNIT_TO_MS: Record<CustomUnit, number> = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

const CUSTOM_UNITS: { value: CustomUnit; label: string }[] = [
  { value: "minutes", label: "Min" },
  { value: "hours", label: "Hrs" },
  { value: "days", label: "Days" },
];

// Extracted so Race and Eboard polls can reuse the exact same create form
// instead of forking three more copies (same reasoning as
// PollsListScreen/PollDetailScreen). The "Ends" section is new — the
// Stitch create-poll mockup had no deadline field at all (only the list
// screen's badge implied one exists), so this was planned and confirmed
// with the founder before being designed: relative duration chips rather
// than an absolute date+time field, computed into closes_at here.
interface Props {
  scope: PollScope;
  canCreate: boolean;
  listPath: string;
  pollPath: (pollId: string) => string;
  // Only club chat's "+" attach menu passes this (matches attachMenu's own
  // club-chat-only scoping) — when the create form was reached from there
  // (?from=chat, appended by ChatScreen), landing on the new poll's own
  // detail screen after Create is redundant with the chat card the same
  // creation already auto-posts (0071), and just adds an extra back-tap to
  // return to the conversation. Falls back to pollPath when absent/unset.
  chatPath?: string;
}

export function PollCreateScreen({ scope, canCreate, listPath, pollPath, chatPath }: Props) {
  const { session } = useAuth();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [endsChoice, setEndsChoice] = useState<EndsChoice>("none");
  const [customAmount, setCustomAmount] = useState("");
  const [customUnit, setCustomUnit] = useState<CustomUnit>("hours");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canCreate) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(listPath);
      }
    }
  }, [canCreate, listPath, router]);

  const updateOption = (index: number, text: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? text : o)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, ""]);
  };

  const removeOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!session) return;
    setError(null);

    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);

    if (!trimmedQuestion) {
      setError("Question is required.");
      return;
    }
    if (trimmedOptions.length < 2) {
      setError("Add at least 2 options.");
      return;
    }

    let closesAt: string | null = null;
    if (endsChoice === "custom") {
      const amount = Number(customAmount);
      if (!Number.isInteger(amount) || amount < 1) {
        setError("Enter a whole number (1 or more).");
        return;
      }
      closesAt = new Date(Date.now() + amount * UNIT_TO_MS[customUnit]).toISOString();
    } else if (endsChoice !== "none") {
      closesAt = new Date(Date.now() + CHOICE_TO_DAYS[endsChoice] * 86400000).toISOString();
    }

    setSaving(true);
    try {
      const created = await createPoll({
        scope,
        question: trimmedQuestion,
        options: trimmedOptions,
        allowMultiple,
        isPrivate,
        closesAt,
        createdBy: session.user.id,
      });
      router.replace(from === "chat" && chatPath ? chatPath : pollPath(created.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const endsChips: { value: EndsChoice; label: string }[] = [
    { value: "none", label: "No deadline" },
    { value: "1d", label: "1 Day" },
    { value: "3d", label: "3 Days" },
    { value: "1w", label: "1 Week" },
    { value: "custom", label: "Custom" },
  ];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Question</Text>
          <TextInput
            style={styles.textarea}
            placeholder="What should we do for the team social?"
            placeholderTextColor={colors.onSurfaceVariant}
            value={question}
            onChangeText={setQuestion}
            multiline
          />
        </View>

        <View style={styles.card}>
          <View style={styles.optionsHeader}>
            <Text style={styles.cardTitle}>Options</Text>
            <Text style={styles.optionsCount}>{options.filter((o) => o.trim()).length} Options Added</Text>
          </View>
          {options.map((option, index) => (
            <View key={index} style={styles.optionRow}>
              <TextInput
                style={[styles.input, styles.optionInput]}
                placeholder={`Option ${index + 1}`}
                placeholderTextColor={colors.onSurfaceVariant}
                value={option}
                onChangeText={(text) => updateOption(index, text)}
              />
              {options.length > 2 && (
                <TouchableOpacity style={styles.removeButton} onPress={() => removeOption(index)}>
                  <Text style={styles.removeButtonText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {options.length < MAX_OPTIONS && (
            <TouchableOpacity style={styles.addOptionButton} onPress={addOption}>
              <Text style={styles.addOptionButtonText}>+ ADD OPTION</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ends</Text>
          <View style={styles.chipsRow}>
            {endsChips.map((chip) => (
              <TouchableOpacity
                key={chip.value}
                style={[styles.chip, endsChoice === chip.value && styles.chipActive]}
                onPress={() => setEndsChoice(chip.value)}
              >
                <Text style={[styles.chipText, endsChoice === chip.value && styles.chipTextActive]}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {endsChoice === "custom" && (
            <View style={styles.customRow}>
              <TextInput
                style={[styles.input, styles.customInput]}
                placeholder="30"
                placeholderTextColor={colors.onSurfaceVariant}
                value={customAmount}
                onChangeText={setCustomAmount}
                keyboardType="number-pad"
              />
              <View style={styles.unitChipsRow}>
                {CUSTOM_UNITS.map((unit) => (
                  <TouchableOpacity
                    key={unit.value}
                    style={[styles.unitChip, customUnit === unit.value && styles.unitChipActive]}
                    onPress={() => setCustomUnit(unit.value)}
                  >
                    <Text style={[styles.unitChipText, customUnit === unit.value && styles.unitChipTextActive]}>{unit.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Poll Settings</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelWrap}>
              <Text style={styles.switchLabel}>Allow selecting multiple options</Text>
              <Text style={styles.switchSubLabel}>Voters can pick more than one choice</Text>
            </View>
            <ThemedSwitch value={allowMultiple} onValueChange={setAllowMultiple} />
          </View>
          <View style={styles.divider} />
          <View style={styles.switchRow}>
            <View style={styles.switchLabelWrap}>
              <Text style={styles.switchLabel}>Private vote</Text>
              <Text style={styles.switchSubLabel}>Only you can see who voted for each option</Text>
            </View>
            <ThemedSwitch value={isPrivate} onValueChange={setIsPrivate} />
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? "CREATING…" : "CREATE POLL"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.marginMobile, gap: spacing.stackMd },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
    gap: spacing.stackSm,
  },
  label: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "uppercase" },
  cardTitle: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onSurface },
  textarea: {
    ...typography.bodyMd,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: spacing.gutter,
    color: colors.onSurface,
    minHeight: 72,
    textAlignVertical: "top",
  },
  optionsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  optionsCount: { ...typography.labelSm, fontSize: 11, color: colors.onSurfaceVariant, backgroundColor: colors.surfaceContainer, borderRadius: radii.sm, paddingHorizontal: spacing.stackSm, paddingVertical: 2, textTransform: "none" },
  optionRow: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  input: {
    ...typography.bodyMd,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm + 2,
    color: colors.onSurface,
  },
  optionInput: { flex: 1 },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.errorContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  removeButtonText: { color: colors.onErrorContainer, fontWeight: "700" },
  addOptionButton: { alignSelf: "flex-start" },
  addOptionButtonText: { ...typography.labelSm, fontSize: 12, color: colors.primary },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.stackSm },
  chip: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.full,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm,
    backgroundColor: colors.surfaceContainerLow,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.labelSm, fontSize: 12, color: colors.onSurfaceVariant, textTransform: "none" },
  chipTextActive: { color: colors.onPrimary },
  customRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.stackSm, marginTop: spacing.stackSm },
  customInput: { width: 64, textAlign: "center" },
  customLabel: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant },
  unitChipsRow: { flexDirection: "row", gap: 6 },
  unitChip: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.md,
    paddingHorizontal: spacing.stackSm + 2,
    paddingVertical: spacing.stackSm,
    backgroundColor: colors.surfaceContainerLow,
  },
  unitChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  unitChipText: { ...typography.labelSm, fontSize: 12, color: colors.onSurfaceVariant, textTransform: "none" },
  unitChipTextActive: { color: colors.onPrimary },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.gutter },
  switchLabelWrap: { flex: 1 },
  switchLabel: { ...typography.bodyMd, fontWeight: "700", fontSize: 15, color: colors.onSurface },
  switchSubLabel: { ...typography.labelSm, fontSize: 11, color: colors.onSurfaceVariant, textTransform: "none", marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.outlineVariant },
  error: { color: colors.error, textAlign: "center" },
  saveButton: { backgroundColor: colors.primary, borderRadius: radii.full, paddingVertical: spacing.gutter, alignItems: "center" },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { ...typography.headlineLgMobile, fontSize: 16, color: colors.onPrimary },
});
