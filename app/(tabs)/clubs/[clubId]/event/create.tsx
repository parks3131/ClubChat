import { MaterialIcons } from "@expo/vector-icons";
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
  type TextInputProps,
} from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { useAuth } from "../../../../../contexts/AuthProvider";
import { combineToIso, isPastInstant, isSameInstant, splitIso } from "../../../../../lib/dates";
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

// Kinetic-styled input: a 2px border that snaps to primary on focus, per
// DESIGN.md's Components section ("the focus state should be a 2px
// Energetic Orange ring") — the closest RN equivalent to the mockup's
// CSS focus ring/glass-blur treatment.
function KineticInput({ style, ...props }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      style={[styles.input, focused && styles.inputFocused, style]}
      placeholderTextColor={colors.outline + "80"}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
    />
  );
}

export default function CreateOrEditEventScreen() {
  const { clubId, eventId, from } = useLocalSearchParams<{ clubId: string; eventId?: string; from?: string }>();
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
  // Original values as loaded, so editing a past event's title doesn't
  // get blocked by its own already-past date — only actually changing a
  // date to a past value (on create or edit) is rejected.
  const [originalStartAt, setOriginalStartAt] = useState<string | null>(null);
  const [originalEndAt, setOriginalEndAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!club.isAdmin) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/clubs/${clubId}/calendar`);
      }
    }
  }, [club.role, router, clubId]);

  useEffect(() => {
    if (!isEditing) return;
    setLoading(true);
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
        setOriginalStartAt(existing.startAt);
        if (existing.endAt) {
          const end = splitIso(existing.endAt);
          setEndDate(end.date);
          setEndTime(end.time);
        }
        setOriginalEndAt(existing.endAt ?? null);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [isEditing, eventId, retryToken]);

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
    if (isPastInstant(startAt) && !isSameInstant(startAt, originalStartAt)) {
      setError("Start date/time can't be in the past.");
      return;
    }

    let endAt: string | null = null;
    if (endDate.trim() || endTime.trim()) {
      endAt = combineToIso(endDate.trim(), endTime.trim());
      if (!endAt) {
        setError("End date/time must be YYYY-MM-DD and HH:MM, or both left blank.");
        return;
      }
      if (isPastInstant(endAt) && !isSameInstant(endAt, originalEndAt)) {
        setError("End date/time can't be in the past.");
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
        // Reached from club chat's "+" attach menu (?from=chat, appended by
        // ChatScreen) — the creation already auto-posts an event card into
        // chat (0071), so land back there instead of on the new event's own
        // detail screen, same reasoning as PollCreateScreen's chatPath.
        router.replace(from === "chat" ? `/clubs/${clubId}/chat` : `/clubs/${clubId}/event/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load this event." onRetry={() => setRetryToken((t) => t + 1)} />;
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
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{isEditing ? "EDIT EVENT" : "NEW EVENT"}</Text>
          <View style={styles.titleUnderline} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRowScroll}>
          <View style={styles.typeRow}>
            {EVENT_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[styles.typeChip, eventType === t.value && styles.typeChipActive]}
                onPress={() => setEventType(t.value)}
              >
                <Text style={[styles.typeChipText, eventType === t.value && styles.typeChipTextActive]}>
                  {t.label.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={styles.field}>
          <Text style={styles.label}>Event Title</Text>
          <KineticInput placeholder="e.g. Morning Sprint Championship" value={title} onChangeText={setTitle} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Location</Text>
          <View style={styles.inputIconWrap}>
            <MaterialIcons name="location-on" size={20} color={colors.outline} style={styles.inputIcon} />
            <KineticInput
              style={styles.inputWithIcon}
              placeholder="Where's it happening?"
              value={location}
              onChangeText={setLocation}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <KineticInput
            style={styles.multiline}
            placeholder="Tell the team what to bring, the schedule, and any requirements..."
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </View>

        <View style={styles.scheduleCard}>
          <Text style={styles.scheduleTitle}>SCHEDULE</Text>

          <View style={styles.scheduleField}>
            <Text style={styles.scheduleLabel}>Starts</Text>
            <View style={styles.dateTimeRow}>
              <KineticInput
                style={[styles.dateInput]}
                placeholder="YYYY-MM-DD"
                value={startDate}
                onChangeText={setStartDate}
              />
              <KineticInput style={[styles.timeInput]} placeholder="HH:MM" value={startTime} onChangeText={setStartTime} />
            </View>
          </View>

          <View style={styles.scheduleField}>
            <Text style={styles.scheduleLabel}>Ends (optional)</Text>
            <View style={styles.dateTimeRow}>
              <KineticInput style={[styles.dateInput]} placeholder="YYYY-MM-DD" value={endDate} onChangeText={setEndDate} />
              <KineticInput style={[styles.timeInput]} placeholder="HH:MM" value={endTime} onChangeText={setEndTime} />
            </View>
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Text style={styles.buttonText}>SAVE EVENT</Text>
              <MaterialIcons name="send" size={20} color={colors.onPrimary} />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.marginMobile, gap: spacing.stackMd },
  titleWrap: { gap: spacing.stackSm, marginBottom: spacing.unit },
  title: { ...typography.displayXl, fontSize: 34, color: colors.onSurface, letterSpacing: 0 },
  titleUnderline: { height: 4, width: 96, backgroundColor: colors.primary, borderRadius: radii.full },
  typeRowScroll: { marginHorizontal: -spacing.marginMobile },
  typeRow: { flexDirection: "row", gap: spacing.gutter, paddingHorizontal: spacing.marginMobile, paddingBottom: spacing.stackSm },
  typeChip: {
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    borderRadius: radii.full,
    paddingHorizontal: spacing.gutter + 8,
    paddingVertical: spacing.stackSm,
    backgroundColor: colors.surfaceContainerLowest,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { ...typography.labelSm, color: colors.onSurfaceVariant, letterSpacing: 1 },
  typeChipTextActive: { color: colors.onPrimary },
  field: { gap: spacing.unit },
  label: { ...typography.labelSm, color: colors.primary, letterSpacing: 1 },
  input: {
    ...typography.bodyMd,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.gutter,
    color: colors.onSurface,
  },
  inputFocused: { borderColor: colors.primary },
  inputIconWrap: { position: "relative", justifyContent: "center" },
  inputIcon: { position: "absolute", left: spacing.gutter, zIndex: 1 },
  inputWithIcon: { paddingLeft: spacing.gutter + 28 },
  multiline: { height: 120, textAlignVertical: "top" },
  scheduleCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    borderRadius: radii.lg,
    padding: spacing.gutter,
    gap: spacing.gutter,
  },
  scheduleTitle: { ...typography.headlineLgMobile, fontSize: 22, color: colors.onSurface },
  scheduleField: { gap: spacing.stackSm },
  scheduleLabel: { ...typography.labelSm, color: colors.onSurfaceVariant, letterSpacing: 1 },
  dateTimeRow: { flexDirection: "row", gap: spacing.stackSm },
  dateInput: { flex: 2 },
  timeInput: { flex: 1 },
  error: { ...typography.bodyMd, color: colors.error, textAlign: "center" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.stackSm,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.gutter,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.statValue, color: colors.onPrimary, letterSpacing: 1 },
});
