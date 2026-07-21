import { MaterialIcons } from "@expo/vector-icons";
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
  View,
} from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { fetchClubProfile, updateClubProfile } from "../../../../../lib/clubs";
import type { ClubJoinPolicy } from "../../../../../types/database";
import { useClub } from "../_layout";

export default function EditClubProfileScreen() {
  const club = useClub();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<ClubJoinPolicy>("request");
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
          setJoinPolicy(p.joinPolicy);
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
      await updateClubProfile(club.clubId, { name: name.trim(), description: description.trim(), joinPolicy });
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
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.field}>
        <Text style={styles.label}>Club name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Club name"
          placeholderTextColor={colors.onSurfaceVariant}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="What's this club about?"
          placeholderTextColor={colors.onSurfaceVariant}
          multiline
        />
      </View>

      <Text style={styles.label}>Join Policy</Text>
      <View style={styles.policyRow}>
        <TouchableOpacity
          style={[styles.policyOption, joinPolicy === "open" && styles.policyOptionActive]}
          onPress={() => setJoinPolicy("open")}
        >
          <View style={styles.policyHeader}>
            <View style={styles.policyIconWrap}>
              <MaterialIcons name="public" size={20} color={colors.primary} />
            </View>
            <View style={[styles.radioOuter, joinPolicy === "open" && styles.radioOuterActive]}>
              {joinPolicy === "open" && <View style={styles.radioInner} />}
            </View>
          </View>
          <Text style={styles.policyText}>Open</Text>
          <Text style={styles.policyHint}>Anyone can find and join the club immediately.</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.policyOption, joinPolicy === "request" && styles.policyOptionActive]}
          onPress={() => setJoinPolicy("request")}
        >
          <View style={styles.policyHeader}>
            <View style={styles.policyIconWrap}>
              <MaterialIcons name="lock-open" size={20} color={colors.primary} />
            </View>
            <View style={[styles.radioOuter, joinPolicy === "request" && styles.radioOuterActive]}>
              {joinPolicy === "request" && <View style={styles.radioInner} />}
            </View>
          </View>
          <Text style={styles.policyText}>Request</Text>
          <Text style={styles.policyHint}>Admin must approve each member's request.</Text>
        </TouchableOpacity>
      </View>
      {joinPolicy === "open" && (
        <Text style={styles.policyNote}>
          Switching to Open will automatically approve anyone with a pending join request.
        </Text>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, (!name.trim() || saving) && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={!name.trim() || saving}
      >
        {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>Save</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: {
    flex: 1,
    padding: spacing.marginMobile,
    gap: spacing.gutter,
    backgroundColor: colors.surface,
  },
  field: { gap: spacing.unit },
  label: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "uppercase" },
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
  multiline: { height: 120, textAlignVertical: "top" },
  policyRow: { flexDirection: "row", gap: spacing.stackSm },
  policyOption: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLowest,
    padding: spacing.stackSm + 4,
    gap: spacing.stackSm,
  },
  policyOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryFixed + "20" },
  policyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  policyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: { borderColor: colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  policyText: { ...typography.statValue, color: colors.onSurface },
  policyHint: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "none", lineHeight: 16 },
  policyNote: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "none", lineHeight: 16 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 8,
    alignItems: "center",
    marginTop: spacing.stackSm,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onPrimary },
  error: { color: colors.error, textAlign: "center" },
});
