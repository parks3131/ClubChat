import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { fetchProfile, formatDateOfBirth, type Profile } from "../../../../../lib/profile";

export default function MemberProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchProfile(userId)
        .then((p) => {
          if (!cancelled) {
            setProfile(p);
            setLoadError(false);
          }
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
    }, [userId, retryToken])
  );

  if (loadError) {
    return <LoadError message="Couldn't load this member's profile." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (loading || !profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {profile.avatarUrl ? (
        <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>{profile.fullName.charAt(0).toUpperCase() || "?"}</Text>
        </View>
      )}
      <Text style={styles.name}>{profile.fullName || "ClubChat member"}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.value}>{profile.bio || "No description yet."}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>City</Text>
        <Text style={styles.value}>{profile.city || "Not set"}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Date of birth</Text>
        <Text style={styles.value}>{formatDateOfBirth(profile.dateOfBirth)}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>School</Text>
        <Text style={styles.value}>{profile.school || "Not set"}</Text>
      </View>
    </ScrollView>
  );
}

const AVATAR_SIZE = 96;

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { alignItems: "center", padding: 24, gap: 8 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, marginBottom: 8 },
  avatarPlaceholder: { backgroundColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 36, fontWeight: "700", color: "#475569" },
  name: { fontSize: 22, fontWeight: "700" },
  section: { width: "100%", maxWidth: 420, marginTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#64748b", marginBottom: 4 },
  value: { fontSize: 15, color: "#334155" },
});
