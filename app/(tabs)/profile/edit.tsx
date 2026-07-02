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
} from "react-native";
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
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [session])
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

  if (loading) {
    return <ActivityIndicator style={styles.centered} />;
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Your name" />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell your clubs a bit about yourself"
          multiline
        />

        <Text style={styles.label}>City</Text>
        <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="Where you're based" />

        <Text style={styles.label}>Date of birth (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          placeholder="1998-04-12"
          autoCapitalize="none"
        />

        <Text style={styles.label}>School</Text>
        <TextInput style={styles.input} value={school} onChangeText={setSchool} placeholder="Where you studied" />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, (!fullName.trim() || saving) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!fullName.trim() || saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1 },
  flex: { flex: 1 },
  container: { padding: 24, gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#475569", marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 14, fontSize: 16 },
  multiline: { height: 120, textAlignVertical: "top" },
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#dc2626", textAlign: "center" },
});
