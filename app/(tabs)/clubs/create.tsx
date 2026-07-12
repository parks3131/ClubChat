import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
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
import { colors, radii, spacing, typography } from "../../../constants/theme";
import { useAuth } from "../../../contexts/AuthProvider";
import { createClub } from "../../../lib/clubs";
import type { ClubJoinPolicy } from "../../../types/database";

export default function CreateClubScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [description, setDescription] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<ClubJoinPolicy>("request");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!session) return;
    setError(null);
    setLoading(true);
    try {
      const club = await createClub({
        name: name.trim(),
        sport: sport.trim(),
        description: description.trim(),
        createdBy: session.user.id,
        joinPolicy,
      });
      router.replace(`/clubs/${club.id}/chat`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.title}>Build Your Squad</Text>
      <Text style={styles.subtitle}>Create a home for your team, track events, and stay connected.</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Club Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Westside Spartans"
          placeholderTextColor={colors.onSurfaceVariant}
          value={name}
          onChangeText={setName}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Sport</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Running, Swimming"
          placeholderTextColor={colors.onSurfaceVariant}
          value={sport}
          onChangeText={setSport}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Tell the community what your club is about..."
          placeholderTextColor={colors.onSurfaceVariant}
          value={description}
          onChangeText={setDescription}
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

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, (!name || loading) && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={!name || loading}
      >
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>Create Club</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.marginMobile,
    gap: spacing.gutter,
    backgroundColor: colors.surface,
  },
  title: { ...typography.headlineLg, fontSize: 26, color: colors.onSurface, marginTop: spacing.stackSm },
  subtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant, marginTop: -spacing.stackSm },
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
  multiline: { height: 90, textAlignVertical: "top" },
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
