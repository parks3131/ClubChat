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
import { LoadError } from "../../../../../../components/LoadError";
import { isPastDateOnly } from "../../../../../../lib/dates";
import { fetchRaceProfile, updateRaceProfile } from "../../../../../../lib/races";
import { useRace } from "./_layout";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors club-profile/edit.tsx exactly, adapted to races' actual
// editable fields (name + event date — races have no description column
// of their own; "Meet Information" already owns a distinct description
// field, so this doesn't duplicate it).
export default function EditRaceProfileScreen() {
  const race = useRace();
  const router = useRouter();
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!race.isManager) {
      if (router.canGoBack()) router.back();
      else router.replace(`/clubs/${race.clubId}/race/${race.raceId}/profile`);
    }
  }, [race.isManager, race.clubId, race.raceId, router]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchRaceProfile(race.raceId)
        .then((p) => {
          if (cancelled) return;
          setName(p.name);
          setEventDate(p.eventDate);
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
    }, [race.raceId, retryToken])
  );

  const handleSave = async () => {
    setError(null);

    if (!DATE_RE.test(eventDate.trim())) {
      setError("Date must be YYYY-MM-DD.");
      return;
    }
    if (isPastDateOnly(eventDate.trim())) {
      setError("Date can't be in the past.");
      return;
    }

    setSaving(true);
    try {
      await updateRaceProfile(race.raceId, { name: name.trim(), eventDate: eventDate.trim() });
      if (router.canGoBack()) router.back();
      else router.replace(`/clubs/${race.clubId}/race/${race.raceId}/profile`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load this race." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (loading || !race.isManager) {
    return <ActivityIndicator style={styles.centered} />;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.label}>Race name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Race name" />

      <Text style={styles.label}>Date</Text>
      <TextInput style={styles.input} value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" />

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
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#dc2626", textAlign: "center" },
});
