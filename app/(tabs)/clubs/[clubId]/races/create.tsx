import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
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
        <Text style={styles.title}>New race channel</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Nittany Lion Invitational"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Date</Text>
        <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={eventDate} onChangeText={setEventDate} />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
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
