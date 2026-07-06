import { useFocusEffect } from "expo-router";
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
import {
  addEboardMember,
  decideEboardJoinRequest,
  fetchEboardMembers,
  fetchPendingEboardRequests,
  searchClubAdminsToAdd,
  type EboardJoinRequestRow,
  type EboardMemberRow,
  type SearchedClubAdmin,
} from "../../../../../lib/eboard";
import { useEboard } from "./_layout";

function reportError(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong";
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert("Error", message);
}

// Mirrors race/[raceId]/roster.tsx, but add/decide rights belong to
// existing members only (eboard.channel.isMember), not to every club
// admin — see migration 0017_eboard.sql. Any club admin can still view
// the member list (RLS: is_eboard_club_admin), just not act on it until
// they're a member themselves.
export default function EboardRosterScreen() {
  const eboard = useEboard();
  const canManage = eboard.channel?.isMember ?? false;

  const [members, setMembers] = useState<EboardMemberRow[]>([]);
  const [requests, setRequests] = useState<EboardJoinRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SearchedClubAdmin[]>([]);
  const [addSearching, setAddSearching] = useState(false);

  const reload = useCallback(() => {
    if (!eboard.channel) return Promise.resolve();
    const loaders: Promise<unknown>[] = [fetchEboardMembers(eboard.channel.id).then(setMembers)];
    if (canManage) {
      loaders.push(fetchPendingEboardRequests(eboard.channel.id).then(setRequests));
    }
    return Promise.all(loaders);
  }, [eboard.channel, canManage]);

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
    if (!canManage) return;
    const trimmed = addQuery.trim();
    if (trimmed.length < 2) {
      setAddResults([]);
      return;
    }
    setAddSearching(true);
    const timeout = setTimeout(() => {
      searchClubAdminsToAdd(
        eboard.clubId,
        trimmed,
        members.map((m) => m.userId)
      )
        .then(setAddResults)
        .catch(reportError)
        .finally(() => setAddSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [addQuery, canManage, eboard.clubId, members]);

  const handleDecide = async (request: EboardJoinRequestRow, approve: boolean) => {
    setBusyUserId(request.userId);
    try {
      await decideEboardJoinRequest(request.id, approve);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleAdd = async (user: SearchedClubAdmin) => {
    if (!eboard.channel) return;
    setBusyUserId(user.id);
    try {
      await addEboardMember(eboard.channel.id, user.id);
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
          {canManage && (
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Add a member</Text>
              <TextInput
                style={styles.input}
                placeholder="Search club admins by name"
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

          {canManage && requests.length > 0 && (
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
      renderItem={({ item }) => (
        <View style={styles.memberRow}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.memberAvatar} />
          ) : (
            <View style={[styles.memberAvatar, styles.avatarPlaceholder]}>
              <Text style={styles.memberAvatarInitial}>{item.fullName.charAt(0).toUpperCase() || "?"}</Text>
            </View>
          )}
          <Text style={styles.rowName}>{item.fullName}</Text>
        </View>
      )}
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
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  memberAvatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { backgroundColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  memberAvatarInitial: { fontSize: 15, fontWeight: "700", color: "#475569" },
  rowName: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  actionButton: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  addButton: { backgroundColor: "#16a34a" },
  addText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  approveButton: { backgroundColor: "#16a34a" },
  approveText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  denyButton: { backgroundColor: "#dc2626" },
  denyText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  empty: { textAlign: "center", marginTop: 40, color: "#888" },
});
