import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { useAuth } from "../../../../../contexts/AuthProvider";
import { fetchClubProfile, uploadClubAvatar, type ClubProfile } from "../../../../../lib/clubs";
import { timeAgo } from "../../../../../lib/dates";
import { pickImageOnWeb } from "../../../../../lib/pickImageOnWeb";
import {
  addMember,
  decideJoinRequest,
  fetchClubMembers,
  fetchPendingRequests,
  promoteToAdmin,
  removeMember,
  searchUsersToAdd,
  type ClubMemberRow,
  type JoinRequestRow,
  type SearchedUser,
} from "../../../../../lib/members";
import { reportError } from "../../../../../lib/reportError";
import { useClub } from "../_layout";

function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "OK", onPress: () => resolve(true) },
    ]);
  });
}

export default function ClubProfileScreen() {
  const club = useClub();
  const router = useRouter();
  const { session } = useAuth();
  const isAdmin = club.role === "admin";

  const [profile, setProfile] = useState<ClubProfile | null>(null);
  const [members, setMembers] = useState<ClubMemberRow[]>([]);
  const [requests, setRequests] = useState<JoinRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SearchedUser[]>([]);
  const [addSearching, setAddSearching] = useState(false);

  const reload = useCallback(() => {
    const loaders: Promise<unknown>[] = [
      fetchClubProfile(club.clubId).then(setProfile),
      fetchClubMembers(club.clubId).then(setMembers),
    ];
    if (isAdmin) {
      loaders.push(fetchPendingRequests(club.clubId).then(setRequests));
    }
    return Promise.all(loaders);
  }, [club.clubId, isAdmin]);

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

  useEffect(() => {
    if (!isAdmin) return;
    const trimmed = addQuery.trim();
    if (trimmed.length < 2) {
      setAddResults([]);
      return;
    }
    setAddSearching(true);
    const timeout = setTimeout(() => {
      searchUsersToAdd(
        trimmed,
        members.map((m) => m.userId)
      )
        .then(setAddResults)
        .catch(reportError)
        .finally(() => setAddSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [addQuery, isAdmin, members]);

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

  const handleCopyCode = () => {
    if (Platform.OS === "web" && navigator.clipboard) {
      navigator.clipboard.writeText(club.inviteCode).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePromote = async (member: ClubMemberRow) => {
    const proceed = await confirmAction("Make admin?", `Make ${member.fullName} an admin?`);
    if (!proceed) return;
    setBusyUserId(member.userId);
    try {
      await promoteToAdmin(club.clubId, member.userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = async (member: ClubMemberRow) => {
    const proceed = await confirmAction("Remove member?", `Remove ${member.fullName} from the club?`);
    if (!proceed) return;
    setBusyUserId(member.userId);
    try {
      await removeMember(club.clubId, member.userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDecide = async (request: JoinRequestRow, approve: boolean) => {
    setBusyUserId(request.userId);
    try {
      await decideJoinRequest(request.id, approve);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleAdd = async (user: SearchedUser) => {
    setBusyUserId(user.id);
    try {
      await addMember(club.clubId, user.id);
      setAddQuery("");
      setAddResults([]);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
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

  return (
    <FlatList
      data={members}
      keyExtractor={(item) => item.userId}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
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
              <View style={styles.inviteRow}>
                <Text style={styles.inviteLabel}>INVITE CODE:</Text>
                <Text style={styles.inviteCode}>{club.inviteCode}</Text>
                <TouchableOpacity style={styles.copyButton} onPress={handleCopyCode}>
                  <MaterialIcons name={copied ? "check" : "content-copy"} size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {isAdmin && (
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Add a member</Text>
              <TextInput
                style={styles.input}
                placeholder="Search by name"
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="none"
                value={addQuery}
                onChangeText={setAddQuery}
              />
              {addSearching && <ActivityIndicator style={{ marginTop: 6 }} color={colors.primary} />}
              {addResults.map((user) => (
                <Pressable
                  key={user.id}
                  style={(state) => [styles.addResultRow, (state as { hovered?: boolean }).hovered && styles.addResultRowHovered]}
                  onPress={() => handleAdd(user)}
                  disabled={busyUserId === user.id}
                >
                  <Text style={styles.rowName}>{user.fullName}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {isAdmin && requests.length > 0 && (
            <View style={styles.requestsSection}>
              <View style={styles.requestsHeader}>
                <Text style={styles.sectionTitle}>Pending Requests</Text>
                <Text style={styles.requestsCount}>{requests.length} NEW</Text>
              </View>
              {requests.map((r) => (
                <View key={r.id} style={styles.requestRow}>
                  <View>
                    <Text style={styles.rowName}>{r.fullName}</Text>
                    <Text style={styles.requestMeta}>Requested {timeAgo(r.createdAt)}</Text>
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={[styles.iconActionButton, styles.denyIconButton]}
                      onPress={() => handleDecide(r, false)}
                      disabled={busyUserId === r.userId}
                    >
                      <MaterialIcons name="close" size={18} color={colors.onErrorContainer} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconActionButton, styles.approveIconButton]}
                      onPress={() => handleDecide(r, true)}
                      disabled={busyUserId === r.userId}
                    >
                      <MaterialIcons name="check" size={18} color={colors.onPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.membersHeader}>
            <Text style={styles.sectionTitle}>Member Roster</Text>
            <Text style={styles.membersCount}>{members.length} MEMBERS</Text>
          </View>
        </View>
      }
      renderItem={({ item }) => {
        const isSelf = item.userId === session?.user.id;
        return (
          <View style={styles.memberRow}>
            <TouchableOpacity
              style={styles.memberInfo}
              onPress={() => router.push(`/clubs/${club.clubId}/member/${item.userId}`)}
            >
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.memberAvatar} />
              ) : (
                <View style={[styles.memberAvatar, styles.avatarPlaceholder]}>
                  <Text style={styles.memberAvatarInitial}>{item.fullName.charAt(0).toUpperCase() || "?"}</Text>
                </View>
              )}
              <View>
                <View style={styles.memberNameRow}>
                  <Text style={styles.rowName}>{item.fullName}</Text>
                  <Text style={[styles.roleChip, item.role === "admin" ? styles.adminChip : styles.memberChip]}>
                    {item.role === "admin" ? "ADMIN" : "MEMBER"}
                  </Text>
                </View>
                {isSelf && <Text style={styles.joinedMeta}>You</Text>}
              </View>
            </TouchableOpacity>
            {isAdmin && !isSelf ? (
              <View style={styles.memberActions}>
                {item.role !== "admin" && (
                  <TouchableOpacity
                    style={styles.iconTextButton}
                    onPress={() => handlePromote(item)}
                    disabled={busyUserId === item.userId}
                  >
                    <MaterialCommunityIcons name="shield-account" size={18} color={colors.tertiary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.iconTextButton}
                  onPress={() => handleRemove(item)}
                  disabled={busyUserId === item.userId}
                >
                  <MaterialIcons name="person-remove" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            ) : isAdmin && isSelf ? (
              <MaterialIcons name="lock" size={18} color={colors.onSurfaceVariant + "60"} />
            ) : null}
          </View>
        );
      }}
      ListEmptyComponent={<Text style={styles.empty}>No members yet.</Text>}
    />
  );
}

const AVATAR_SIZE = 96;

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.marginMobile, gap: spacing.stackSm, backgroundColor: colors.surface },
  identitySection: { alignItems: "center", marginBottom: spacing.stackSm, gap: spacing.stackSm },
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
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radii.full,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  inviteLabel: { ...typography.labelSm, color: colors.onSurfaceVariant },
  inviteCode: { ...typography.statValue, color: colors.primary, letterSpacing: 1 },
  copyButton: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.full,
    padding: spacing.unit + 2,
  },
  sectionTitle: { ...typography.statValue, fontSize: 15, color: colors.onSurface },
  addSection: { marginTop: spacing.stackMd, gap: spacing.stackSm },
  input: {
    ...typography.bodyMd,
    borderWidth: 2,
    borderColor: colors.surfaceContainerHigh,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm,
    color: colors.onSurface,
  },
  addResultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  addResultRowHovered: { backgroundColor: colors.primaryFixed, borderColor: colors.primary },
  requestsSection: { marginTop: spacing.stackMd, gap: spacing.stackSm },
  requestsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  requestsCount: {
    ...typography.labelSm,
    color: colors.onPrimary,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
  },
  requestRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.stackSm + 4,
  },
  requestMeta: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "none", marginTop: 2 },
  requestActions: { flexDirection: "row", gap: spacing.stackSm },
  iconActionButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  denyIconButton: { backgroundColor: colors.errorContainer },
  approveIconButton: { backgroundColor: colors.primary },
  membersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.stackMd,
    marginBottom: spacing.stackSm,
  },
  membersCount: { ...typography.labelSm, color: colors.onSurfaceVariant },
  memberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    padding: spacing.stackSm + 4,
    marginBottom: spacing.unit,
  },
  memberInfo: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm, flex: 1 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  memberActions: { flexDirection: "row", gap: spacing.unit },
  memberAvatar: { width: 44, height: 44, borderRadius: radii.md },
  memberAvatarInitial: { ...typography.statValue, fontSize: 16, color: colors.primary },
  rowName: { ...typography.bodyMd, fontWeight: "700", color: colors.onSurface, fontSize: 15 },
  joinedMeta: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "none", marginTop: 2 },
  roleChip: { ...typography.labelSm, fontSize: 10, borderRadius: radii.sm, paddingHorizontal: spacing.stackSm, paddingVertical: 2 },
  adminChip: { backgroundColor: colors.primary + "1a", color: colors.primary },
  memberChip: { backgroundColor: colors.surfaceContainerHigh, color: colors.onSecondaryContainer },
  iconTextButton: { padding: spacing.stackSm },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant },
});
