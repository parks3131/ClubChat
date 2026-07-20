import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { updateEboardProfile } from "../../../../../lib/eboard";
import { useEboard } from "./_layout";
import { useRouter } from "expo-router";

// Mirrors club-profile/edit.tsx exactly, adapted to Eboard's own fields
// (name + description, same shape it's created with).
export default function EditEboardProfileScreen() {
  const eboard = useEboard();
  const router = useRouter();
  const [name, setName] = useState(eboard.channel?.name ?? "");
  const [description, setDescription] = useState(eboard.channel?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eboard.channel?.isMember) {
      if (router.canGoBack()) router.back();
      else router.replace(`/clubs/${eboard.clubId}/eboard`);
    }
  }, [eboard.channel, eboard.clubId, router]);

  const handleSave = async () => {
    if (!eboard.channel) return;
    setError(null);
    setSaving(true);
    try {
      await updateEboardProfile(eboard.channel.id, { name: name.trim(), description: description.trim() });
      await eboard.reload();
      if (router.canGoBack()) router.back();
      else router.replace(`/clubs/${eboard.clubId}/eboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (!eboard.channel?.isMember) {
    return <ActivityIndicator style={styles.centered} />;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Eboard & Council" />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="What's this space for?"
        multiline
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, (!name.trim() || saving) && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={!name.trim() || saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1 },
  container: { flex: 1, padding: 24, gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#475569", marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 14, fontSize: 16 },
  multiline: { height: 120, textAlignVertical: "top" },
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#dc2626", textAlign: "center" },
});
