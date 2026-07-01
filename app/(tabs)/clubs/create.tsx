import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useAuth } from "../../../contexts/AuthProvider";
import { createClub } from "../../../lib/clubs";

export default function CreateClubScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!session) return;
    setError(null);
    setLoading(true);
    try {
      const club = await createClub({
        name: name.trim(),
        sport: sport.trim(),
        description: description.trim(),
        createdBy: session.user.id,
      });
      router.replace(`/clubs/${club.id}/chat`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.title}>Create a club</Text>

      <TextInput style={styles.input} placeholder="Club name" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="Sport (e.g. Running, Swimming)"
        value={sport}
        onChangeText={setSport}
      />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Description (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, (!name || loading) && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={!name || loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 14, fontSize: 16 },
  multiline: { height: 90, textAlignVertical: "top" },
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#dc2626", textAlign: "center" },
});
