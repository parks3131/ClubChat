import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { fetchClubProfile, updateClubProfile } from "../../../../../lib/clubs";
import { useClub } from "../_layout";

export default function EditClubProfileScreen() {
  const club = useClub();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!club.isAdmin) {
      if (router.canGoBack()) router.back();
      else router.replace(`/clubs/${club.clubId}/club-profile`);
    }
  }, [club.role, club.clubId, router]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchClubProfile(club.clubId)
        .then((p) => {
          if (cancelled) return;
          setName(p.name);
          setDescription(p.description ?? "");
          setLoadError(false);
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [club.clubId, retryToken])
  );

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateClubProfile(club.clubId, { name: name.trim(), description: description.trim() });
      if (router.canGoBack()) router.back();
      else router.replace(`/clubs/${club.clubId}/club-profile`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load this club's profile." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (loading || !club.isAdmin) {
    return <ActivityIndicator style={styles.centered} />;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.label}>Club name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Club name" />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="What's this club about?"
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
