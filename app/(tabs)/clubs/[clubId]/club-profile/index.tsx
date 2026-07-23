import { MaterialIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { useAuth } from "../../../../../contexts/AuthProvider";
import { buildClubJoinLink, deleteClub, fetchClubProfile, uploadClubAvatar, type ClubProfile } from "../../../../../lib/clubs";
import { fetchClubMembers, removeMember, type ClubMemberRow } from "../../../../../lib/members";
import { pickImageOnWeb } from "../../../../../lib/pickImageOnWeb";
import { reportError } from "../../../../../lib/reportError";
import { useClub } from "../_layout";

const AVATAR_STACK_SIZE = 4;

// Mirrors race/[raceId]/roster.tsx's confirmAction — Alert.alert is a
// no-op on web (SPEC.md section 6), so a destructive action needs an
// explicit web branch through window.confirm instead.
function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "OK", onPress: () => resolve(true) },
    ]);
  });
}

// Slim identity + menu screen, matching the founder's iMessage-style
// reference — the inline add-member/pending-requests/roster management
// this screen used to hold entirely now lives on club-profile/members.tsx.
export default function ClubProfileScreen() {
  const club = useClub();
  const router = useRouter();
  const { session } = useAuth();
  const isAdmin = club.isAdmin;

  const [profile, setProfile] = useState<ClubProfile | null>(null);
  const [members, setMembers] = useState<ClubMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deletingClub, setDeletingClub] = useState(false);
  const [leavingClub, setLeavingClub] = useState(false);

  const reload = useCallback(
    () => Promise.all([fetchClubProfile(club.clubId).then(setProfile), fetchClubMembers(club.clubId).then(setMembers)]),
    [club.clubId]
  );

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

  const handleEditPic = async () => {
    if (!isAdmin) return;

    let asset: { uri: string; mimeType: string } | null;
    if (Platform.OS === "web") {
      asset = await pickImageOnWeb();
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        reportError(new Error("Photo library access is required to change the club picture."));
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
      const avatarUrl = await uploadClubAvatar(club.clubId, asset.uri, asset.mimeType);
      setProfile((p) => (p ? { ...p, avatarUrl } : p));
    } catch (err) {
      reportError(err);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const joinLink = buildClubJoinLink(club.inviteCode);

  const handleCopyLink = async () => {
    if (Platform.OS === "web") {
      if (navigator.clipboard) await navigator.clipboard.writeText(joinLink).catch(() => {});
    } else {
      await Clipboard.setStringAsync(joinLink);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareLink = async () => {
    try {
      // `url` is iOS-only in RN's Share API — Android silently drops it, so
      // the link has to be embedded in `message` there instead, which would
      // duplicate it on iOS if `url` were also set. Branch to avoid that.
      await Share.share(
        Platform.OS === "ios"
          ? { title: `Join ${club.name}`, message: `Join ${club.name} on ClubChat!`, url: joinLink }
          : { title: `Join ${club.name}`, message: `Join ${club.name} on ClubChat: ${joinLink}` }
      );
    } catch {
      // No native/web share sheet available (e.g. desktop Chrome lacks
      // navigator.share) — fall back to copying the link instead.
      await handleCopyLink();
    }
  };

  const handleDeleteClub = async () => {
    const proceed = await confirmAction(
      "Delete this club?",
      `Delete ${club.name}? This permanently deletes its chat history, members, races, Eboard & Council, and everything else for everyone. This can't be undone.`
    );
    if (!proceed) return;
    setDeletingClub(true);
    try {
      await deleteClub(club.clubId);
      // `dismissTo`, not `replace`: this screen sits several levels deep
      // (index -> hub -> club-profile), and `replace` only swaps the
      // current top-of-stack entry in place — leaving the hub (for a
      // club that no longer exists/no longer has this member) still
      // sitting underneath, reachable via back. `dismissTo` actually
      // pops all the way back down to the existing root entry instead.
      router.dismissTo("/clubs");
    } catch (err) {
      reportError(err);
      setDeletingClub(false);
    }
  };

  // Leaving removes this club's own club_members row — already self-
  // leave-able for anyone but the Owner (0043's "members can leave except
  // the owner" policy), and already cascades to every race/Eboard channel
  // under this club too (handle_club_member_removed_membership_sync,
  // 0043), so "leave main chat -> out of everything" needs no extra work
  // here beyond the delete + navigating away before any RLS-gated screen
  // under this club tries to re-render with access already revoked.
  const handleLeaveClub = async () => {
    if (!session) return;
    const proceed = await confirmAction(
      "Leave this club?",
      `Leave ${club.name}? You'll lose access to its chat, races, and Eboard & Council. You can rejoin later if it's open, or ask an admin to add you back.`
    );
    if (!proceed) return;
    setLeavingClub(true);
    try {
      await removeMember(club.clubId, session.user.id);
      // `dismissTo`, not `replace`: this screen sits several levels deep
      // (index -> hub -> club-profile), and `replace` only swaps the
      // current top-of-stack entry in place — leaving the hub (for a
      // club that no longer exists/no longer has this member) still
      // sitting underneath, reachable via back. `dismissTo` actually
      // pops all the way back down to the existing root entry instead.
      router.dismissTo("/clubs");
    } catch (err) {
      reportError(err);
      setLeavingClub(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load this club's profile." onRetry={reload} />;
  }

  if (loading || !profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const preview = members.slice(0, AVATAR_STACK_SIZE);

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.identitySection}>
        <TouchableOpacity style={styles.avatarWrap} onPress={handleEditPic} disabled={!isAdmin || uploadingAvatar}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{profile.name.charAt(0).toUpperCase() || "?"}</Text>
            </View>
          )}
          {isAdmin && (
            <View style={styles.editPicButton}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <MaterialIcons name="edit" size={16} color={colors.onPrimary} />
              )}
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{profile.name}</Text>
          {isAdmin && (
            <TouchableOpacity onPress={() => router.push(`/clubs/${club.clubId}/club-profile/edit`)}>
              <MaterialIcons name="edit-square" size={18} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.description}>{profile.description || "No description yet."}</Text>

        {isAdmin && (
          <View style={styles.shareRow}>
            <TouchableOpacity style={styles.shareButton} onPress={handleShareLink}>
              <MaterialIcons name="ios-share" size={16} color={colors.onPrimary} />
              <Text style={styles.shareButtonText}>Share join link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink}>
              <MaterialIcons name={copied ? "check" : "content-copy"} size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.grid}>
        <TouchableOpacity style={styles.row} onPress={() => router.push(`/clubs/${club.clubId}/club-profile/members`)}>
          <View style={[styles.iconBadge, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="group" size={22} color={colors.onPrimary} />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>Members</Text>
            <Text style={styles.rowSubtitle}>{members.length}</Text>
          </View>
          <View style={styles.avatarStack}>
            {preview.map((m, i) => (
              <View key={m.userId} style={[styles.stackAvatarWrap, { marginLeft: i === 0 ? 0 : -10 }]}>
                {m.avatarUrl ? (
                  <Image source={{ uri: m.avatarUrl }} style={styles.stackAvatar} />
                ) : (
                  <View style={[styles.stackAvatar, styles.avatarPlaceholder]}>
                    <Text style={styles.stackAvatarInitial}>{m.fullName.charAt(0).toUpperCase() || "?"}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => router.push(`/clubs/${club.clubId}/club-profile/gallery`)}>
          <View style={[styles.iconBadge, { backgroundColor: colors.tertiary }]}>
            <MaterialIcons name="photo-library" size={22} color={colors.onPrimary} />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>Gallery</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      {!club.isOwner && (
        <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveClub} disabled={leavingClub}>
          {leavingClub ? (
            <ActivityIndicator size="small" color={colors.onSurfaceVariant} />
          ) : (
            <Text style={styles.leaveButtonText}>Leave Club</Text>
          )}
        </TouchableOpacity>
      )}

      {club.isOwner && (
        // Blocked at the RLS layer too (0043's self-leave policy excludes
        // role = 'owner') — exactly one Owner must exist at all times, so
        // leaving outright would orphan the club. Transfer first instead.
        <Text style={styles.leaveHint}>Transfer ownership from Members to leave this club.</Text>
      )}

      {club.isOwner && (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteClub} disabled={deletingClub}>
          {deletingClub ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Text style={styles.deleteButtonText}>Delete Club</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const AVATAR_SIZE = 96;

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.marginMobile, backgroundColor: colors.surface },
  identitySection: { alignItems: "center", marginBottom: spacing.stackLg, gap: spacing.stackSm },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: radii.lg },
  avatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  avatarInitial: { ...typography.headlineLg, fontSize: 32, color: colors.primary },
  editPicButton: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surfaceContainerLowest,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  name: { ...typography.headlineLgMobile, fontSize: 22, color: colors.onSurface },
  description: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: "center", paddingHorizontal: spacing.gutter },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.unit + 2,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm,
  },
  shareButtonText: { ...typography.labelSm, color: colors.onPrimary, textTransform: "uppercase" },
  copyButton: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.full,
    padding: spacing.unit + 2,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  grid: { gap: spacing.stackSm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.gutter,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  iconBadge: { width: 44, height: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  rowTextWrap: { flex: 1 },
  rowLabel: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface },
  rowSubtitle: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 },
  avatarStack: { flexDirection: "row", alignItems: "center", marginRight: spacing.stackSm },
  stackAvatarWrap: { borderRadius: 16, borderWidth: 2, borderColor: colors.surfaceContainerLowest },
  stackAvatar: { width: 28, height: 28, borderRadius: 14 },
  stackAvatarInitial: { ...typography.labelSm, fontSize: 11, color: colors.primary },
  deleteButton: {
    marginTop: spacing.stackLg,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radii.lg,
    paddingVertical: spacing.stackSm + 4,
    alignItems: "center",
  },
  deleteButtonText: { ...typography.bodyMd, fontWeight: "700", fontSize: 15, color: colors.error },
  leaveButton: {
    marginTop: spacing.stackLg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.lg,
    paddingVertical: spacing.stackSm + 4,
    alignItems: "center",
  },
  leaveButtonText: { ...typography.bodyMd, fontWeight: "700", fontSize: 15, color: colors.onSurfaceVariant },
  leaveHint: {
    ...typography.bodyMd,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginTop: spacing.stackLg,
  },
});
