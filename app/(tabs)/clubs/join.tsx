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
import { joinClubByCode } from "../../../lib/clubs";

export default function JoinClubScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    setError(null);
    setLoading(true);
    try {
      const club = await joinClubByCode(code.trim());
      router.replace(`/clubs/${club.id}/chat`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid invite code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.title}>Join a club</Text>

      <TextInput
        style={styles.input}
        placeholder="Invite code"
        autoCapitalize="none"
        value={code}
        onChangeText={setCode}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, (!code || loading) && styles.buttonDisabled]}
        onPress={handleJoin}
        disabled={!code || loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 14, fontSize: 16 },
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#dc2626", textAlign: "center" },
});
