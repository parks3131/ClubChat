import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { useAuth } from "../../../../../contexts/AuthProvider";
import { fetchClubProfile, uploadClubAvatar, type ClubProfile } from "../../../../../lib/clubs";
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

    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        reportError(new Error("Photo library access is required to change the club picture."));
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
      const avatarUrl = await uploadClubAvatar(club.clubId, asset.uri, asset.mimeType ?? "image/jpeg");
      setProfile((p) => (p ? { ...p, avatarUrl } : p));
    } catch (err) {
      reportError(err);
    } finally {
      setUploadingAvatar(false);
    }
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
        <ActivityIndicator />
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
            <View style={styles.avatarWrap}>
              {profile.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{profile.name.charAt(0).toUpperCase() || "?"}</Text>
                </View>
              )}
              {isAdmin && (
                <TouchableOpacity style={styles.editPicButton} onPress={handleEditPic} disabled={uploadingAvatar}>
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.editPicIcon}>✎</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.description}>{profile.description || "No description yet."}</Text>
            {isAdmin && (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => router.push(`/clubs/${club.clubId}/club-profile/edit`)}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {isAdmin && (
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Add a member</Text>
              <TextInput
                style={styles.input}
                placeholder="Search by name"
                autoCapitalize="none"
                value={addQuery}
                onChangeText={setAddQuery}
              />
              {addSearching && <ActivityIndicator style={{ marginTop: 6 }} />}
              {addResults.map((user) => (
                <View key={user.id} style={styles.addResultRow}>
                  <Text style={styles.rowName}>{user.fullName}</Text>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.addButton]}
                    onPress={() => handleAdd(user)}
                    disabled={busyUserId === user.id}
                  >
                    <Text style={styles.addText}>Add</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {isAdmin && requests.length > 0 && (
            <View style={styles.requestsSection}>
              <Text style={styles.sectionTitle}>Pending requests</Text>
              {requests.map((r) => (
                <View key={r.id} style={styles.requestRow}>
                  <Text style={styles.rowName}>{r.fullName}</Text>
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.approveButton]}
                      onPress={() => handleDecide(r, true)}
                      disabled={busyUserId === r.userId}
                    >
                      <Text style={styles.approveText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.denyButton]}
                      onPress={() => handleDecide(r, false)}
                      disabled={busyUserId === r.userId}
                    >
                      <Text style={styles.denyText}>Deny</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>Members</Text>
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
                <Text style={styles.rowName}>{item.fullName}</Text>
                <Text style={styles.role}>{item.role === "admin" ? "Admin" : "Member"}</Text>
              </View>
            </TouchableOpacity>
            {isAdmin && !isSelf && (
              <View style={styles.memberActions}>
                {item.role !== "admin" && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handlePromote(item)}
                    disabled={busyUserId === item.userId}
                  >
                    <Text style={styles.promoteText}>Make admin</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleRemove(item)}
                  disabled={busyUserId === item.userId}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      }}
      ListEmptyComponent={<Text style={styles.empty}>No members yet.</Text>}
    />
  );
}

const AVATAR_SIZE = 88;

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 8 },
  identitySection: { alignItems: "center", marginBottom: 12 },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE, marginBottom: 8 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarPlaceholder: { backgroundColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 32, fontWeight: "700", color: "#475569" },
  editPicButton: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  editPicIcon: { color: "#fff", fontSize: 13 },
  name: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  description: { fontSize: 14, color: "#475569", textAlign: "center", marginTop: 6, paddingHorizontal: 12 },
  editButton: {
    borderWidth: 1,
    borderColor: "#2563eb",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 18,
    marginTop: 10,
  },
  editButtonText: { color: "#2563eb", fontWeight: "600" },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#64748b", marginTop: 12, marginBottom: 6 },
  addSection: { marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, fontSize: 14 },
  addResultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  requestsSection: { marginBottom: 4 },
  requestRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  requestActions: { flexDirection: "row", gap: 8 },
  memberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  memberInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  memberActions: { flexDirection: "row", gap: 8 },
  memberAvatar: { width: 36, height: 36, borderRadius: 18 },
  memberAvatarInitial: { fontSize: 15, fontWeight: "700", color: "#475569" },
  rowName: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  role: { fontSize: 12, color: "#64748b", marginTop: 2 },
  actionButton: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  promoteText: { color: "#2563eb", fontWeight: "600", fontSize: 13 },
  removeText: { color: "#dc2626", fontWeight: "600", fontSize: 13 },
  addButton: { backgroundColor: "#16a34a" },
  addText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  approveButton: { backgroundColor: "#16a34a" },
  approveText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  denyButton: { backgroundColor: "#dc2626" },
  denyText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  empty: { textAlign: "center", marginTop: 40, color: "#888" },
});
