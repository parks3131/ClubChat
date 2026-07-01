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
import { useAuth } from "../../../../../contexts/AuthProvider";
import { createEvent, fetchEvent, updateEvent } from "../../../../../lib/calendar";
import type { CalendarEventType } from "../../../../../types/database";
import { useClub } from "../_layout";

const EVENT_TYPES: { value: CalendarEventType; label: string }[] = [
  { value: "race", label: "Race" },
  { value: "practice", label: "Practice" },
  { value: "team_bonding", label: "Team bonding" },
  { value: "volunteer", label: "Volunteer" },
  { value: "other", label: "Other" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

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

export default function CreateOrEditEventScreen() {
  const { clubId, eventId } = useLocalSearchParams<{ clubId: string; eventId?: string }>();
  const club = useClub();
  const { session } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const isEditing = !!eventId;

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? "Edit event" : "New event" });
  }, [navigation, isEditing]);

  const [eventType, setEventType] = useState<CalendarEventType>("practice");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (club.role !== "admin") {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/clubs/${clubId}/calendar`);
      }
    }
  }, [club.role, router, clubId]);

  useEffect(() => {
    if (!isEditing) return;
    fetchEvent(eventId!)
      .then((existing) => {
        if (!existing) return;
        setEventType(existing.eventType);
        setTitle(existing.title);
        setLocation(existing.location ?? "");
        setDescription(existing.description ?? "");
        const start = splitIso(existing.startAt);
        setStartDate(start.date);
        setStartTime(start.time);
        if (existing.endAt) {
          const end = splitIso(existing.endAt);
          setEndDate(end.date);
          setEndTime(end.time);
        }
      })
      .finally(() => setLoading(false));
  }, [isEditing, eventId]);

  const handleSave = async () => {
    if (!session) return;
    setError(null);

    const startAt = combineToIso(startDate.trim(), startTime.trim());
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!startAt) {
      setError("Start date/time must be YYYY-MM-DD and HH:MM.");
      return;
    }

    let endAt: string | null = null;
    if (endDate.trim() || endTime.trim()) {
      endAt = combineToIso(endDate.trim(), endTime.trim());
      if (!endAt) {
        setError("End date/time must be YYYY-MM-DD and HH:MM, or both left blank.");
        return;
      }
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateEvent(eventId!, {
          eventType,
          title: title.trim(),
          description: description.trim(),
          location: location.trim(),
          startAt,
          endAt,
        });
        router.replace(`/clubs/${clubId}/event/${eventId}`);
      } else {
        const created = await createEvent({
          clubId: club.clubId,
          eventType,
          title: title.trim(),
          description: description.trim(),
          location: location.trim(),
          startAt,
          endAt,
          createdBy: session.user.id,
        });
        router.replace(`/clubs/${clubId}/event/${created.id}`);
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
        <Text style={styles.title}>{isEditing ? "Edit event" : "New event"}</Text>

        <View style={styles.typeRow}>
          {EVENT_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, eventType === t.value && styles.typeChipActive]}
              onPress={() => setEventType(t.value)}
            >
              <Text style={[styles.typeChipText, eventType === t.value && styles.typeChipTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput style={styles.input} placeholder="Event title" value={title} onChangeText={setTitle} />
        <TextInput style={styles.input} placeholder="Location" value={location} onChangeText={setLocation} />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Description (optional)"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.sectionLabel}>Starts</Text>
        <View style={styles.dateTimeRow}>
          <TextInput
            style={[styles.input, styles.dateInput]}
            placeholder="YYYY-MM-DD"
            value={startDate}
            onChangeText={setStartDate}
          />
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="HH:MM"
            value={startTime}
            onChangeText={setStartTime}
          />
        </View>

        <Text style={styles.sectionLabel}>Ends (optional)</Text>
        <View style={styles.dateTimeRow}>
          <TextInput
            style={[styles.input, styles.dateInput]}
            placeholder="YYYY-MM-DD"
            value={endDate}
            onChangeText={setEndDate}
          />
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="HH:MM"
            value={endTime}
            onChangeText={setEndTime}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save event</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  typeChip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typeChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  typeChipText: { fontSize: 13, color: "#334155" },
  typeChipTextActive: { color: "#fff", fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 14, fontSize: 16 },
  multiline: { height: 90, textAlignVertical: "top" },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: "#64748b", marginTop: 4 },
  dateTimeRow: { flexDirection: "row", gap: 8 },
  dateInput: { flex: 2 },
  timeInput: { flex: 1 },
  error: { color: "#dc2626", textAlign: "center" },
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
