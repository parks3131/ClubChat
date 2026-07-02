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
  View,
} from "react-native";
import { useAuth } from "../../../contexts/AuthProvider";
import { createClub } from "../../../lib/clubs";
import type { ClubJoinPolicy } from "../../../types/database";

export default function CreateClubScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [description, setDescription] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<ClubJoinPolicy>("request");
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
        joinPolicy,
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

      <Text style={styles.label}>Who can join?</Text>
      <View style={styles.policyRow}>
        <TouchableOpacity
          style={[styles.policyOption, joinPolicy === "open" && styles.policyOptionActive]}
          onPress={() => setJoinPolicy("open")}
        >
          <Text style={[styles.policyText, joinPolicy === "open" && styles.policyTextActive]}>
            Anyone can join
          </Text>
          <Text style={styles.policyHint}>Found via search, joins instantly</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.policyOption, joinPolicy === "request" && styles.policyOptionActive]}
          onPress={() => setJoinPolicy("request")}
        >
          <Text style={[styles.policyText, joinPolicy === "request" && styles.policyTextActive]}>
            Requires approval
          </Text>
          <Text style={styles.policyHint}>You approve each request</Text>
        </TouchableOpacity>
      </View>

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
  label: { fontSize: 13, fontWeight: "600", color: "#475569", marginTop: 4 },
  policyRow: { flexDirection: "row", gap: 10 },
  policyOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    gap: 2,
  },
  policyOptionActive: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  policyText: { fontWeight: "600", color: "#334155" },
  policyTextActive: { color: "#2563eb" },
  policyHint: { fontSize: 12, color: "#64748b" },
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#dc2626", textAlign: "center" },
});
