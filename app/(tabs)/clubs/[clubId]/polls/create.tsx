import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../../../../contexts/AuthProvider";
import { createPoll } from "../../../../../lib/polls";
import { useClub } from "../_layout";

const MAX_OPTIONS = 10;

export default function CreatePollScreen() {
  const club = useClub();
  const { session } = useAuth();
  const router = useRouter();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (club.role !== "admin") {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/clubs/${club.clubId}/polls`);
      }
    }
  }, [club.role, club.clubId, router]);

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

    setSaving(true);
    try {
      const created = await createPoll({
        clubId: club.clubId,
        question: trimmedQuestion,
        options: trimmedOptions,
        allowMultiple,
        isPrivate,
        createdBy: session.user.id,
      });
      router.replace(`/clubs/${club.clubId}/polls/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>New poll</Text>

        <Text style={styles.label}>Question</Text>
        <TextInput
          style={styles.input}
          placeholder="What should we do for the team social?"
          value={question}
          onChangeText={setQuestion}
        />

        <Text style={styles.label}>Options</Text>
        {options.map((option, index) => (
          <View key={index} style={styles.optionRow}>
            <TextInput
              style={[styles.input, styles.optionInput]}
              placeholder={`Option ${index + 1}`}
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
            <Text style={styles.addOptionButtonText}>+ Add option</Text>
          </TouchableOpacity>
        )}

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Allow selecting multiple options</Text>
          <Switch value={allowMultiple} onValueChange={setAllowMultiple} />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Private vote (only you can see who voted)</Text>
          <Switch value={isPrivate} onValueChange={setIsPrivate} />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? "Creating…" : "Create"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a", marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#64748b", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  optionInput: { flex: 1 },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  removeButtonText: { color: "#dc2626", fontWeight: "700" },
  addOptionButton: { marginTop: 10, alignSelf: "flex-start" },
  addOptionButtonText: { color: "#2563eb", fontWeight: "600", fontSize: 14 },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    gap: 12,
  },
  switchLabel: { fontSize: 14, color: "#334155", flexShrink: 1 },
  error: { color: "#dc2626", marginTop: 8 },
  saveButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
