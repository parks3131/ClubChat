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
import { LoadError } from "../../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../../constants/theme";
import { useAuth } from "../../../../../../contexts/AuthProvider";
import { combineToIso, isPastInstant, isSameInstant, splitIso } from "../../../../../../lib/dates";
import { createMeeting, fetchMeeting, updateMeeting } from "../../../../../../lib/eboard";
import { useEboard } from "../_layout";

export default function CreateOrEditMeetingScreen() {
  const { meetingId, from } = useLocalSearchParams<{ meetingId?: string; from?: string }>();
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
  // As loaded, so editing a past meeting's title/link doesn't get blocked
  // by its own already-past date — only actually changing the date to a
  // past value is rejected.
  const [originalMeetingAt, setOriginalMeetingAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eboard.channel?.isMember) {
      router.replace(`/clubs/${eboard.clubId}/eboard`);
    }
  }, [eboard.channel, eboard.clubId, router]);

  useEffect(() => {
    if (!isEditing) return;
    setLoading(true);
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
        setOriginalMeetingAt(existing.meetingAt);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [isEditing, meetingId, session, eboard.clubId, router, retryToken]);

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
    if (isPastInstant(meetingAt) && !isSameInstant(meetingAt, originalMeetingAt)) {
      setError("Date/time can't be in the past.");
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
        // Reached from Eboard chat's "+" attach menu (?from=chat, appended
        // by ChatScreen) — landing on the meeting's own detail screen is
        // redundant with the chat card this creation already auto-posts
        // (0077), and just adds an extra back-tap to return to the
        // conversation.
        router.replace(
          from === "chat" ? `/clubs/${eboard.clubId}/eboard/chat` : `/clubs/${eboard.clubId}/eboard/meeting/${created.id}`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load this meeting." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isEditing ? "Edit meeting" : "New meeting"}</Text>

        <TextInput
          style={styles.input}
          placeholder="Meeting title"
          placeholderTextColor={colors.onSurfaceVariant}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Description (optional)"
          placeholderTextColor={colors.onSurfaceVariant}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.sectionLabel}>Date & time</Text>
        <View style={styles.dateTimeRow}>
          <TextInput
            style={[styles.input, styles.dateInput]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.onSurfaceVariant}
            value={date}
            onChangeText={setDate}
          />
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="HH:MM"
            placeholderTextColor={colors.onSurfaceVariant}
            value={time}
            onChangeText={setTime}
          />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Link (Zoom, Google Meet, etc. — optional)"
          placeholderTextColor={colors.onSurfaceVariant}
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
          {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.saveButtonText}>Save meeting</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.marginMobile, gap: spacing.stackSm },
  title: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface },
  sectionLabel: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "uppercase", marginTop: spacing.unit },
  input: {
    ...typography.bodyMd,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm + 4,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  dateTimeRow: { flexDirection: "row", gap: spacing.stackSm },
  dateInput: { flex: 2 },
  timeInput: { flex: 1 },
  error: { color: colors.error, marginTop: spacing.stackSm },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 8,
    alignItems: "center",
    marginTop: spacing.gutter,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onPrimary },
});
