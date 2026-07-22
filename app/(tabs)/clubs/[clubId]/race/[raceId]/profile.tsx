import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../../constants/theme";
import { useAuth } from "../../../../../../contexts/AuthProvider";
import { pickImageOnWeb } from "../../../../../../lib/pickImageOnWeb";
import {
  deleteRace,
  fetchRaceMembers,
  fetchRaceProfile,
  removeRaceMember,
  uploadRaceAvatar,
  type RaceProfile,
} from "../../../../../../lib/races";
import { reportError } from "../../../../../../lib/reportError";
import { useRace } from "./_layout";

const AVATAR_STACK_SIZE = 4;
const AVATAR_SIZE = 96;

// Mirrors club-profile/index.tsx's confirmAction — Alert.alert is a no-op
// on web (SPEC.md section 6), so a destructive action needs an explicit
// web branch through window.confirm instead.
function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "OK", onPress: () => resolve(true) },
    ]);
  });
}

function formatEventDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Slim identity + menu screen for a race, mirroring club-profile/index.tsx
// exactly — reached by tapping the race name anywhere in its header. The
// Members preview is just the real race_members roster now — membership
// is no longer implicit for club admins (race-channel rework), so there's
// nothing else to merge in here anymore.
export default function RaceProfileScreen() {
  const race = useRace();
  const router = useRouter();
  const { session } = useAuth();

  const [profile, setProfile] = useState<RaceProfile | null>(null);
  const [preview, setPreview] = useState<{ userId: string; fullName: string; avatarUrl: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deletingRace, setDeletingRace] = useState(false);
  const [leavingRace, setLeavingRace] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const reload = useCallback(async () => {
    const [raceProfile, raceMembers] = await Promise.all([fetchRaceProfile(race.raceId), fetchRaceMembers(race.raceId)]);
    setProfile(raceProfile);
    setPreview(raceMembers.map((m) => ({ userId: m.userId, fullName: m.fullName, avatarUrl: m.avatarUrl })));
  }, [race.raceId]);

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
    if (!race.isManager) return;

    let asset: { uri: string; mimeType: string } | null;
    if (Platform.OS === "web") {
      asset = await pickImageOnWeb();
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        reportError(new Error("Photo library access is required to change the race picture."));
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
      const avatarUrl = await uploadRaceAvatar(race.raceId, asset.uri, asset.mimeType);
      setProfile((p) => (p ? { ...p, avatarUrl } : p));
    } catch (err) {
      reportError(err);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDeleteRace = async () => {
    const proceed = await confirmAction(
      "Delete this race?",
      `Delete ${race.name}? This permanently deletes its chat history, roster, car groups, meet information, and polls. This can't be undone.`
    );
    if (!proceed) return;
    setDeletingRace(true);
    try {
      await deleteRace(race.raceId);
      router.replace(`/clubs/${race.clubId}/races`);
    } catch (err) {
      reportError(err);
      setDeletingRace(false);
    }
  };

  // removeRaceMember already cleans up any race_car_group_members row for
  // this user first (lib/races.ts) — reused as-is here since it's the
  // exact same delete an admin-initiated "Remove" already does, just
  // targeting the caller's own row. If they were a group's Incharge, the
  // DB-side clear_incharge_on_member_removed trigger clears that and
  // notifies the club's admins that the group now needs a new one — the
  // rest of the group's roster is left untouched.
  const handleLeaveRace = async () => {
    if (!session) return;
    const proceed = await confirmAction("Leave this race?", `Leave ${race.name}? You'll lose access to its chat and roster.`);
    if (!proceed) return;
    setLeavingRace(true);
    try {
      await removeRaceMember(race.raceId, session.user.id);
      router.replace(`/clubs/${race.clubId}/races`);
    } catch (err) {
      reportError(err);
      setLeavingRace(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load this race." onRetry={reload} />;
  }

  if (loading || !profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <TouchableOpacity style={styles.avatarWrap} onPress={handleEditPic} disabled={!race.isManager || uploadingAvatar}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{profile.name.charAt(0).toUpperCase() || "?"}</Text>
            </View>
          )}
          {race.isManager && (
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
          <Text style={styles.name}>{profile.name.toUpperCase()}</Text>
          {race.isManager && (
            <TouchableOpacity onPress={() => router.push(`/clubs/${race.clubId}/race/${race.raceId}/edit`)}>
              <MaterialIcons name="edit-square" size={18} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.date}>{formatEventDate(profile.eventDate)}</Text>
      </View>

      <View style={styles.grid}>
        <TouchableOpacity style={styles.row} onPress={() => router.push(`/clubs/${race.clubId}/race/${race.raceId}/roster`)}>
          <View style={[styles.iconBadge, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="group" size={22} color={colors.onPrimary} />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>Members</Text>
            <Text style={styles.rowSubtitle}>{preview.length}</Text>
          </View>
          <View style={styles.avatarStack}>
            {preview.slice(0, AVATAR_STACK_SIZE).map((m, i) => (
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

        <TouchableOpacity style={styles.row} onPress={() => router.push(`/clubs/${race.clubId}/race/${race.raceId}/gallery`)}>
          <View style={[styles.iconBadge, { backgroundColor: colors.tertiary }]}>
            <MaterialIcons name="photo-library" size={22} color={colors.onPrimary} />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>Gallery</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      {race.isMember && (
        <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveRace} disabled={leavingRace}>
          {leavingRace ? (
            <ActivityIndicator size="small" color={colors.onSurfaceVariant} />
          ) : (
            <Text style={styles.leaveButtonText}>Leave Race</Text>
          )}
        </TouchableOpacity>
      )}

      {race.isManager && (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteRace} disabled={deletingRace}>
          {deletingRace ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Text style={styles.deleteButtonText}>Delete Race</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.marginMobile },
  identity: { alignItems: "center", marginBottom: spacing.stackLg, gap: spacing.stackSm },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: radii.lg },
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
  name: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5, textAlign: "center" },
  date: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: spacing.unit },
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
  avatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
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
});
