import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
import { LoadError } from "../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../constants/theme";
import { useAuth } from "../../../contexts/AuthProvider";
import { fetchProfile, updateProfile } from "../../../lib/profile";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function EditProfileScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [school, setSchool] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      setLoading(true);
      fetchProfile(session.user.id)
        .then((p) => {
          if (cancelled) return;
          setFullName(p.fullName);
          setBio(p.bio);
          setCity(p.city);
          setDateOfBirth(p.dateOfBirth ?? "");
          setSchool(p.school);
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
    }, [session, retryToken])
  );

  const handleSave = async () => {
    if (!session) return;
    setError(null);

    const trimmedDob = dateOfBirth.trim();
    if (trimmedDob && !DATE_RE.test(trimmedDob)) {
      setError("Date of birth must be in YYYY-MM-DD format");
      return;
    }

    setSaving(true);
    try {
      await updateProfile(session.user.id, {
        fullName: fullName.trim(),
        bio: bio.trim(),
        city: city.trim(),
        dateOfBirth: trimmedDob || null,
        school: school.trim(),
      });
      if (router.canGoBack()) router.back();
      else router.replace("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load your profile." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (loading) {
    return <ActivityIndicator style={styles.centered} color={colors.primary} />;
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Enter your name"
          placeholderTextColor={colors.onSurfaceVariant}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell your clubs a bit about yourself"
          placeholderTextColor={colors.onSurfaceVariant}
          multiline
        />

        <Text style={styles.label}>City</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="Where you're based"
          placeholderTextColor={colors.onSurfaceVariant}
        />

        <Text style={styles.label}>Date of birth (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          placeholder="1998-04-12"
          placeholderTextColor={colors.onSurfaceVariant}
          autoCapitalize="none"
        />

        <Text style={styles.label}>School</Text>
        <TextInput
          style={styles.input}
          value={school}
          onChangeText={setSchool}
          placeholder="Where you studied"
          placeholderTextColor={colors.onSurfaceVariant}
        />

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, (!fullName.trim() || saving) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!fullName.trim() || saving}
        >
          {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>SAVE</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1 },
  flex: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.marginMobile, gap: spacing.stackSm },
  label: { ...typography.labelSm, fontSize: 12, textTransform: "none", color: colors.onSurfaceVariant, marginTop: spacing.stackSm },
  input: {
    ...typography.bodyMd,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.DEFAULT,
    padding: spacing.gutter,
    fontSize: 16,
  },
  multiline: { height: 120, textAlignVertical: "top" },
  footer: {
    padding: spacing.marginMobile,
    backgroundColor: colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  button: { backgroundColor: colors.primary, borderRadius: radii.DEFAULT, padding: spacing.gutter, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.headlineLgMobile, fontSize: 20, color: colors.onPrimary },
  error: { color: colors.error, textAlign: "center" },
});
