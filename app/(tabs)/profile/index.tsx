import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../components/LoadError";
import { useAuth } from "../../../contexts/AuthProvider";
import { fetchMyClubs, type ClubWithRole } from "../../../lib/clubs";
import { fetchProfile, formatDateOfBirth, uploadAvatar, type Profile } from "../../../lib/profile";
import { reportError } from "../../../lib/reportError";

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clubs, setClubs] = useState<ClubWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      setLoading(true);
      Promise.all([fetchProfile(session.user.id), fetchMyClubs(session.user.id)])
        .then(([p, c]) => {
          if (cancelled) return;
          setProfile(p);
          setClubs(c);
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

  const handleEditPic = async () => {
    if (!session) return;

    // On web, launchImageLibraryAsync must run synchronously in response to
    // the click (it's just an <input type=file>) — awaiting a permission
    // check first consumes the browser's user-activation window, so the
    // file picker silently fails to open. Permissions aren't a real concept
    // on web anyway, so only gate native platforms on them.
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        reportError(new Error("Photo library access is required to change your picture."));
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const avatarUrl = await uploadAvatar(session.user.id, asset.uri, asset.mimeType ?? "image/jpeg");
      setProfile((p) => (p ? { ...p, avatarUrl } : p));
    } catch (err) {
      reportError(err);
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load your profile." onRetry={() => setRetryToken((t) => t + 1)} />;
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
      <View style={styles.avatarWrap}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{profile.fullName.charAt(0).toUpperCase() || "?"}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.editPicButton} onPress={handleEditPic} disabled={uploadingAvatar}>
          {uploadingAvatar ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.editPicIcon}>✎</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.name}>{profile.fullName || "ClubChat member"}</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <TouchableOpacity style={styles.editProfileButton} onPress={() => router.push("/profile/edit")}>
        <Text style={styles.editProfileText}>Edit Profile</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.bio}>{profile.bio || "No description yet."}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>City</Text>
        <Text style={styles.bio}>{profile.city || "Not set"}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Date of birth</Text>
        <Text style={styles.bio}>{formatDateOfBirth(profile.dateOfBirth)}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>School</Text>
        <Text style={styles.bio}>{profile.school || "Not set"}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your clubs</Text>
        {clubs.length === 0 ? (
          <Text style={styles.bio}>You haven't joined any clubs yet.</Text>
        ) : (
          clubs.map((club) => (
            <TouchableOpacity
              key={club.id}
              style={styles.clubRow}
              onPress={() => router.push(`/clubs/${club.id}?from=profile`)}
            >
              <Text style={styles.clubName}>{club.name}</Text>
              <Text style={styles.clubRole}>{club.role === "admin" ? "Admin" : "Member"}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const AVATAR_SIZE = 96;

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { alignItems: "center", padding: 24, gap: 8 },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE, marginBottom: 8 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarPlaceholder: { backgroundColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 36, fontWeight: "700", color: "#475569" },
  editPicButton: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  editPicIcon: { color: "#fff", fontSize: 14 },
  name: { fontSize: 22, fontWeight: "700" },
  email: { fontSize: 15, color: "#666" },
  editProfileButton: {
    borderWidth: 1,
    borderColor: "#2563eb",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  editProfileText: { color: "#2563eb", fontWeight: "600" },
  section: { width: "100%", maxWidth: 420, marginTop: 20 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#64748b", marginBottom: 6 },
  bio: { fontSize: 15, color: "#334155" },
  clubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  clubName: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  clubRole: { fontSize: 12, color: "#64748b" },
  signOutButton: {
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 28,
  },
  signOutText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
