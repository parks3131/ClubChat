import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../../../../../contexts/AuthProvider";
import { createMeeting, fetchMeeting, updateMeeting } from "../../../../../../lib/eboard";
import { useEboard } from "../_layout";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// Same plain YYYY-MM-DD + HH:MM convention as event/create.tsx — the
// wireframe's calendar-grid/AM-PM-stepper widget was explicitly flagged
// as UI polish that "can do later".
function splitIso(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function combineToIso(date: string, time: string): string | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export default function CreateOrEditMeetingScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId?: string }>();
  const eboard = useEboard();
  const { session } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const isEditing = !!meetingId;

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? "Edit meeting" : "New meeting" });
  }, [navigation, isEditing]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eboard.channel?.isMember) {
      router.replace(`/clubs/${eboard.clubId}/eboard`);
    }
  }, [eboard.channel, eboard.clubId, router]);

  useEffect(() => {
    if (!isEditing) return;
    fetchMeeting(meetingId!)
      .then((existing) => {
        if (!existing) return;
        // Only the creator can edit — RLS already enforces this on save,
        // but a non-creator hitting this URL directly (e.g. via Edit
        // showing on someone else's meeting through a stale UI, or a
        // typed URL) should bounce back rather than fill a form that
        // would fail on submit.
        if (existing.createdBy !== session?.user.id) {
          router.replace(`/clubs/${eboard.clubId}/eboard/meeting/${meetingId}`);
          return;
        }
        setTitle(existing.title);
        setDescription(existing.description ?? "");
        setMeetingLink(existing.meetingLink ?? "");
        const split = splitIso(existing.meetingAt);
        setDate(split.date);
        setTime(split.time);
      })
      .finally(() => setLoading(false));
  }, [isEditing, meetingId, session, eboard.clubId, router]);

  const handleSave = async () => {
    if (!session || !eboard.channel) return;
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    const meetingAt = combineToIso(date.trim(), time.trim());
    if (!meetingAt) {
      setError("Date/time must be YYYY-MM-DD and HH:MM.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateMeeting(meetingId!, {
          title: title.trim(),
          description: description.trim(),
          meetingLink: meetingLink.trim(),
          meetingAt,
        });
        router.replace(`/clubs/${eboard.clubId}/eboard/meeting/${meetingId}`);
      } else {
        const created = await createMeeting({
          eboardChannelId: eboard.channel.id,
          title: title.trim(),
          description: description.trim(),
          meetingLink: meetingLink.trim(),
          meetingAt,
          createdBy: session.user.id,
        });
        router.replace(`/clubs/${eboard.clubId}/eboard/meeting/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isEditing ? "Edit meeting" : "New meeting"}</Text>

        <TextInput style={styles.input} placeholder="Meeting title" value={title} onChangeText={setTitle} />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Description (optional)"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.sectionLabel}>Date & time</Text>
        <View style={styles.dateTimeRow}>
          <TextInput
            style={[styles.input, styles.dateInput]}
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
          />
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="HH:MM"
            value={time}
            onChangeText={setTime}
          />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Link (Zoom, Google Meet, etc. — optional)"
          autoCapitalize="none"
          value={meetingLink}
          onChangeText={setMeetingLink}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save meeting</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a", marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#64748b", marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: "#64748b", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  dateTimeRow: { flexDirection: "row", gap: 8 },
  dateInput: { flex: 2 },
  timeInput: { flex: 1 },
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
