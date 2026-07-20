import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../constants/theme";
import { useAuth } from "../../../contexts/AuthProvider";
import { fetchMyClubs, type ClubWithRole } from "../../../lib/clubs";
import { pickImageOnWeb } from "../../../lib/pickImageOnWeb";
import { deleteAccount, fetchProfile, formatDateOfBirth, uploadAvatar, type Profile } from "../../../lib/profile";
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
  const [deletingAccount, setDeletingAccount] = useState(false);

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

    let asset: { uri: string; mimeType: string } | null;
    if (Platform.OS === "web") {
      // expo-image-picker's web shim opens its file input via
      // dispatchEvent(new MouseEvent("click")) rather than a real .click(),
      // which some browser configurations silently ignore — see
      // lib/pickImageOnWeb.ts for the full story.
      asset = await pickImageOnWeb();
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        reportError(new Error("Photo library access is required to change your picture."));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      asset =
        result.canceled || !result.assets?.[0]
          ? null
          : { uri: result.assets[0].uri, mimeType: result.assets[0].mimeType ?? "image/jpeg" };
    }
    if (!asset) return;

    setUploadingAvatar(true);
    try {
      const avatarUrl = await uploadAvatar(session.user.id, asset.uri, asset.mimeType);
      setProfile((p) => (p ? { ...p, avatarUrl } : p));
    } catch (err) {
      reportError(err);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const runDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await deleteAccount();
      await signOut();
    } catch (err) {
      reportError(err);
      setDeletingAccount(false);
    }
  };

  const handleDeleteAccount = () => {
    const message =
      "This permanently removes your personal info (name, photo, bio, city, date of birth, school) and signs you out for good. Messages and content you've posted stay visible to other members, shown as \"Deleted user\". This can't be undone.";

    // react-native-web's Alert.alert is a no-op, so confirm via window.confirm there.
    if (Platform.OS === "web") {
      if (window.confirm(`Delete your account?\n\n${message}`)) {
        runDeleteAccount();
      }
      return;
    }

    Alert.alert("Delete account?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete account", style: "destructive", onPress: runDeleteAccount },
    ]);
  };

  if (loadError) {
    return <LoadError message="Couldn't load your profile." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (loading || !profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
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
          {uploadingAvatar ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <MaterialIcons name="edit" size={18} color={colors.onPrimary} />
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.name}>{profile.fullName || "ClubChat member"}</Text>
      <Text style={styles.email}>{session?.user.email}</Text>
      <Text style={styles.bioLine}>{profile.bio || "No bio yet."}</Text>

      <View style={styles.clubsSection}>
        <View style={styles.clubsHeader}>
          <Text style={styles.clubsTitle}>Your Clubs</Text>
          <Text style={styles.clubsCount}>{clubs.length} CLUB{clubs.length === 1 ? "" : "S"}</Text>
        </View>
        {clubs.length === 0 ? (
          <Text style={styles.bio}>You haven't joined any clubs yet.</Text>
        ) : (
          <View style={styles.clubChipRow}>
            {clubs.map((club) => (
              <TouchableOpacity
                key={club.id}
                style={styles.clubChip}
                onPress={() => router.push(`/clubs/${club.id}?from=profile`)}
              >
                <Text style={styles.clubChipText}>{club.name}</Text>
                <Text style={styles.clubChipRole}>
                  {club.role === "owner" ? "Owner" : club.role === "admin" ? "Admin" : "Member"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.detailsCard}>
        <DetailRow label="City" value={profile.city || "Not set"} />
        <DetailRow label="Date of birth" value={formatDateOfBirth(profile.dateOfBirth)} />
        <DetailRow label="School" value={profile.school || "Not set"} />
      </View>

      <View style={styles.linksCard}>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/profile/edit")}>
          <View style={styles.linkIconWrap}>
            <MaterialIcons name="manage-accounts" size={18} color={colors.secondary} />
          </View>
          <Text style={styles.linkText}>Edit Profile</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
        <View style={styles.linkDivider} />
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/profile/privacy-policy")}>
          <View style={styles.linkIconWrap}>
            <MaterialIcons name="lock" size={18} color={colors.secondary} />
          </View>
          <Text style={styles.linkText}>Privacy Policy</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
        <View style={styles.linkDivider} />
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/profile/terms")}>
          <View style={styles.linkIconWrap}>
            <MaterialIcons name="description" size={18} color={colors.secondary} />
          </View>
          <Text style={styles.linkText}>Terms of Service</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <MaterialIcons name="logout" size={18} color={colors.onSecondaryContainer} />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount} disabled={deletingAccount}>
        {deletingAccount ? (
          <ActivityIndicator size="small" color={colors.error} />
        ) : (
          <>
            <MaterialIcons name="delete-forever" size={16} color={colors.error} />
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const AVATAR_SIZE = 112;

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { alignItems: "center", padding: spacing.marginMobile, gap: spacing.unit, backgroundColor: colors.surface },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE, marginBottom: spacing.stackSm, marginTop: spacing.stackSm },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, borderWidth: 4, borderColor: colors.surfaceContainerHighest },
  avatarPlaceholder: { backgroundColor: colors.surfaceContainer, alignItems: "center", justifyContent: "center" },
  avatarInitial: { ...typography.headlineLg, fontSize: 40, color: colors.primary },
  editPicButton: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surfaceContainerLowest,
  },
  name: { ...typography.headlineLgMobile, fontSize: 22, color: colors.onSurface },
  email: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  bioLine: { ...typography.bodyMd, color: colors.onSecondaryContainer, textAlign: "center", maxWidth: 300, marginTop: spacing.unit },
  clubsSection: { width: "100%", maxWidth: 420, marginTop: spacing.stackMd },
  clubsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.stackSm },
  clubsTitle: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface },
  clubsCount: { ...typography.labelSm, color: colors.primary },
  clubChipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.stackSm },
  clubChip: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
  },
  clubChipText: { ...typography.labelSm, color: colors.onSurface, textTransform: "none", fontWeight: "700" },
  clubChipRole: { ...typography.labelSm, color: colors.onSurfaceVariant },
  bio: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  detailsCard: {
    width: "100%",
    maxWidth: 420,
    marginTop: spacing.stackMd,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
  },
  detailLabel: { ...typography.labelSm, color: colors.onSurfaceVariant },
  detailValue: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  linksCard: {
    width: "100%",
    maxWidth: 420,
    marginTop: spacing.stackMd,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: "hidden",
  },
  linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.gutter, padding: spacing.gutter },
  linkIconWrap: { width: 36, height: 36, borderRadius: radii.DEFAULT, backgroundColor: colors.secondaryContainer + "50", alignItems: "center", justifyContent: "center" },
  linkText: { flex: 1, ...typography.bodyMd, color: colors.onSurface, fontWeight: "600" },
  linkDivider: { height: 1, backgroundColor: colors.surfaceContainerHigh, marginHorizontal: spacing.gutter },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
    backgroundColor: colors.secondaryContainer,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 4,
    paddingHorizontal: spacing.gutter + 4,
    marginTop: spacing.stackLg,
  },
  signOutText: { ...typography.bodyMd, color: colors.onSecondaryContainer, fontWeight: "700" },
  deleteAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.unit + 2,
    marginTop: spacing.stackSm + 4,
    paddingVertical: spacing.stackSm,
    paddingHorizontal: spacing.gutter,
  },
  deleteAccountText: { ...typography.labelSm, color: colors.error, fontWeight: "700" },
});
