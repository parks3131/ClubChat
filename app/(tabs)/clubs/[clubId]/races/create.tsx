import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { useAuth } from "../../../../../contexts/AuthProvider";
import { isPastDateOnly } from "../../../../../lib/dates";
import { addRaceMember, createRace, searchClubMembersToAdd, type SearchedClubMember } from "../../../../../lib/races";
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

  // Initial-member picker: "the creator chooses which Admins and/or
  // Members to add — either at creation time, or afterward" — this
  // covers the at-creation-time half (afterward already exists via
  // race/[raceId]/roster.tsx's own add-member search). Reuses the same
  // pool searchClubMembersToAdd already exposes (every club member,
  // including admins/owner), same as roster.tsx's add flow.
  const [selected, setSelected] = useState<SearchedClubMember[]>([]);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SearchedClubMember[]>([]);
  const [addSearching, setAddSearching] = useState(false);

  useEffect(() => {
    if (!club.isAdmin) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/clubs/${club.clubId}/races`);
      }
    }
  }, [club.isAdmin, club.clubId, router]);

  useEffect(() => {
    const trimmed = addQuery.trim();
    if (trimmed.length < 2) {
      setAddResults([]);
      return;
    }
    setAddSearching(true);
    const timeout = setTimeout(() => {
      const excludeIds = [session?.user.id ?? "", ...selected.map((s) => s.id)];
      searchClubMembersToAdd(club.clubId, trimmed, excludeIds)
        .then(setAddResults)
        .finally(() => setAddSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [addQuery, club.clubId, session, selected]);

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
    if (isPastDateOnly(eventDate.trim())) {
      setError("Date can't be in the past.");
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
      for (const person of selected) {
        await addRaceMember(created.id, person.id);
      }
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
        <Text style={styles.title}>New Race Channel</Text>
        <Text style={styles.subtitle}>Standalone from the calendar — its own chat, roster, and meet info.</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Nittany Lion Invitational"
          placeholderTextColor={colors.onSurfaceVariant}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.onSurfaceVariant}
          value={eventDate}
          onChangeText={setEventDate}
        />

        <Text style={styles.label}>Add people (optional)</Text>
        <Text style={styles.subtitle}>
          Anyone not added here can request to join once the race is created — you'll always have access as the
          creator.
        </Text>
        {selected.length > 0 && (
          <View style={styles.chipRow}>
            {selected.map((person) => (
              <Pressable
                key={person.id}
                style={styles.chip}
                onPress={() => setSelected((prev) => prev.filter((p) => p.id !== person.id))}
              >
                <Text style={styles.chipText}>{person.fullName} ✕</Text>
              </Pressable>
            ))}
          </View>
        )}
        <TextInput
          style={styles.input}
          placeholder="Search by name"
          placeholderTextColor={colors.onSurfaceVariant}
          value={addQuery}
          onChangeText={setAddQuery}
        />
        {addSearching && <ActivityIndicator style={{ marginTop: spacing.stackSm }} color={colors.primary} />}
        {addResults.map((person) => (
          <Pressable
            key={person.id}
            style={(state) => [styles.addResultRow, (state as { hovered?: boolean }).hovered && styles.addResultRowHovered]}
            onPress={() => {
              setSelected((prev) => [...prev, person]);
              setAddQuery("");
              setAddResults([]);
            }}
          >
            <Text style={styles.addResultText}>{person.fullName}</Text>
          </Pressable>
        ))}

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.saveButtonText}>Create</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.marginMobile, gap: spacing.stackSm },
  title: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface },
  subtitle: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant, marginTop: -spacing.unit },
  label: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "uppercase", marginTop: spacing.stackSm },
  input: {
    ...typography.bodyMd,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm + 6,
  },
  error: { color: colors.error, marginTop: spacing.stackSm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.stackSm },
  chip: {
    backgroundColor: colors.primaryFixed,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm + 4,
    paddingVertical: spacing.unit + 2,
  },
  chipText: { ...typography.labelSm, fontSize: 13, color: colors.primary, textTransform: "none" },
  addResultRow: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  addResultRowHovered: { backgroundColor: colors.primaryFixed, borderColor: colors.primary },
  addResultText: { ...typography.bodyMd, fontWeight: "700", fontSize: 15, color: colors.onSurface },
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
