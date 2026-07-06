import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../../components/LoadError";
import { fetchRaceLocationInfo, updateRaceLocationInfo, type RaceLocationInfo } from "../../../../../../lib/races";
import { reportError } from "../../../../../../lib/reportError";
import { useRace } from "./_layout";

const EMPTY: RaceLocationInfo = {
  description: null,
  locationLink: null,
  hotelLink: null,
  photosLink: null,
  resultsLink: null,
};

// "Meet Information" — merges what were originally two separate features
// (Location & Accommodation, and Photos + Result Link) into one screen
// per a founder follow-up right after both shipped. All 5 fields are
// edited together as one form, one Save. View-mode empty-state is
// deliberately inconsistent across the 5 fields, per explicit founder
// direction: description/location/hotel are hidden entirely (no
// placeholder) when empty, while photos/results keep the "stay tuned"
// placeholder text they originally shipped with. Any club admin can edit.
export default function RaceLocationScreen() {
  const race = useRace();
  const [info, setInfo] = useState<RaceLocationInfo>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RaceLocationInfo>(EMPTY);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => fetchRaceLocationInfo(race.raceId).then(setInfo), [race.raceId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      reload()
        .then(() => {
          if (!cancelled) setLoadError(false);
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
    }, [reload])
  );

  const startEdit = () => {
    setDraft(info);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleaned: RaceLocationInfo = {
        description: draft.description?.trim() || null,
        locationLink: draft.locationLink?.trim() || null,
        hotelLink: draft.hotelLink?.trim() || null,
        photosLink: draft.photosLink?.trim() || null,
        resultsLink: draft.resultsLink?.trim() || null,
      };
      await updateRaceLocationInfo(race.raceId, cleaned);
      setEditing(false);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load meet information." onRetry={reload} />;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (editing) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.label}>Info (where to meet, what to bring, requirements, etc.)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Meet at the north entrance of the rec center at 7am. Bring your own water bottle..."
          multiline
          value={draft.description ?? ""}
          onChangeText={(text) => setDraft((d) => ({ ...d, description: text }))}
        />

        <Text style={styles.label}>Race/event location link</Text>
        <TextInput
          style={styles.input}
          placeholder="https://maps.google.com/..."
          autoCapitalize="none"
          value={draft.locationLink ?? ""}
          onChangeText={(text) => setDraft((d) => ({ ...d, locationLink: text }))}
        />

        <Text style={styles.label}>Hotel location link</Text>
        <TextInput
          style={styles.input}
          placeholder="https://maps.google.com/... or a booking link"
          autoCapitalize="none"
          value={draft.hotelLink ?? ""}
          onChangeText={(text) => setDraft((d) => ({ ...d, hotelLink: text }))}
        />

        <Text style={styles.label}>Photos link</Text>
        <TextInput
          style={styles.input}
          placeholder="https://photos.google.com/share/..."
          autoCapitalize="none"
          value={draft.photosLink ?? ""}
          onChangeText={(text) => setDraft((d) => ({ ...d, photosLink: text }))}
        />

        <Text style={styles.label}>Result link</Text>
        <TextInput
          style={styles.input}
          placeholder="https://..."
          autoCapitalize="none"
          value={draft.resultsLink ?? ""}
          onChangeText={(text) => setDraft((d) => ({ ...d, resultsLink: text }))}
        />

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(false)} disabled={saving}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {info.description && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Info</Text>
          <Text style={styles.description}>{info.description}</Text>
        </View>
      )}

      {info.locationLink && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Race/Event Location</Text>
          <TouchableOpacity onPress={() => Linking.openURL(info.locationLink!)}>
            <Text style={styles.link}>{info.locationLink}</Text>
          </TouchableOpacity>
        </View>
      )}

      {info.hotelLink && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Hotel</Text>
          <TouchableOpacity onPress={() => Linking.openURL(info.hotelLink!)}>
            <Text style={styles.link}>{info.hotelLink}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Photos</Text>
        {info.photosLink ? (
          <TouchableOpacity onPress={() => Linking.openURL(info.photosLink!)}>
            <Text style={styles.link}>{info.photosLink}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.placeholder}>No photos link added yet — stay tuned!</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Result Link</Text>
        {info.resultsLink ? (
          <TouchableOpacity onPress={() => Linking.openURL(info.resultsLink!)}>
            <Text style={styles.link}>{info.resultsLink}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.placeholder}>No result link added yet — stay tuned!</Text>
        )}
      </View>

      {race.isAdmin && (
        <TouchableOpacity style={styles.editButton} onPress={startEdit}>
          <Text style={styles.editButtonText}>Edit Info</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 8 },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: "#64748b", textTransform: "uppercase" },
  description: { fontSize: 15, color: "#334155", marginTop: 4, lineHeight: 21 },
  link: { fontSize: 16, color: "#2563eb", marginTop: 4, textDecorationLine: "underline" },
  placeholder: { fontSize: 14, color: "#94a3b8", fontStyle: "italic", marginTop: 4 },
  label: { fontSize: 13, fontWeight: "600", color: "#64748b", marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, fontSize: 15 },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelButton: { flex: 1, backgroundColor: "#e2e8f0", borderRadius: 8, padding: 12, alignItems: "center" },
  cancelButtonText: { color: "#334155", fontWeight: "600" },
  saveButton: { flex: 1, backgroundColor: "#2563eb", borderRadius: 8, padding: 12, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "700" },
  editButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    alignSelf: "center",
    marginTop: 16,
  },
  editButtonText: { color: "#fff", fontWeight: "700" },
});
