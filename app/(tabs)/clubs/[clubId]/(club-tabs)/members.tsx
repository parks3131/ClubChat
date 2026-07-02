import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
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
import { useAuth } from "../../../../../contexts/AuthProvider";
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

function reportError(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong";
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert("Error", message);
}

export default function ClubMembersScreen() {
  const club = useClub();
  const router = useRouter();
  const { session } = useAuth();
  const [members, setMembers] = useState<ClubMemberRow[]>([]);
  const [requests, setRequests] = useState<JoinRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SearchedUser[]>([]);
  const [addSearching, setAddSearching] = useState(false);

  const reload = useCallback(() => {
    const loaders: Promise<unknown>[] = [fetchClubMembers(club.clubId).then(setMembers)];
    if (club.role === "admin") {
      loaders.push(fetchPendingRequests(club.clubId).then(setRequests));
    }
    return Promise.all(loaders);
  }, [club.clubId, club.role]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      reload().finally(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [reload])
  );

  useEffect(() => {
    if (club.role !== "admin") return;
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
  }, [addQuery, club.role, members]);

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

  if (loading) {
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
          {club.role === "admin" && (
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
                  <Text style={styles.name}>{user.fullName}</Text>
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

          {club.role === "admin" && requests.length > 0 && (
            <View style={styles.requestsSection}>
              <Text style={styles.sectionTitle}>Pending requests</Text>
              {requests.map((r) => (
                <View key={r.id} style={styles.requestRow}>
                  <Text style={styles.name}>{r.fullName}</Text>
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
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{item.fullName.charAt(0).toUpperCase() || "?"}</Text>
                </View>
              )}
              <View>
                <Text style={styles.name}>{item.fullName}</Text>
                <Text style={styles.role}>{item.role === "admin" ? "Admin" : "Member"}</Text>
              </View>
            </TouchableOpacity>
            {club.role === "admin" && !isSelf && (
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

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 8 },
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
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { backgroundColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 15, fontWeight: "700", color: "#475569" },
  name: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
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
