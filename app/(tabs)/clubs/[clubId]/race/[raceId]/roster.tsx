import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  addRaceMember,
  decideRaceJoinRequest,
  fetchPendingRaceRequests,
  fetchRaceMembers,
  searchClubMembersToAdd,
  type RaceJoinRequestRow,
  type RaceMemberRow,
  type SearchedClubMember,
} from "../../../../../../lib/races";
import { reportError } from "../../../../../../lib/reportError";
import { LoadError } from "../../../../../../components/LoadError";
import { useRace } from "./_layout";

// Mirrors club-profile/index.tsx's roster + pending-requests + add-member
// sections, scoped to a race instead of the whole club — reached by
// tapping the race name in the header, same "tap the name to manage
// membership" pattern used everywhere else in the app.
export default function RaceRosterScreen() {
  const race = useRace();
  const isAdmin = race.isAdmin;

  const [members, setMembers] = useState<RaceMemberRow[]>([]);
  const [requests, setRequests] = useState<RaceJoinRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SearchedClubMember[]>([]);
  const [addSearching, setAddSearching] = useState(false);

  const reload = useCallback(() => {
    const loaders: Promise<unknown>[] = [fetchRaceMembers(race.raceId).then(setMembers)];
    if (isAdmin) {
      loaders.push(fetchPendingRaceRequests(race.raceId).then(setRequests));
    }
    return Promise.all(loaders);
  }, [race.raceId, isAdmin]);

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
      searchClubMembersToAdd(
        race.clubId,
        trimmed,
        members.map((m) => m.userId)
      )
        .then(setAddResults)
        .catch(reportError)
        .finally(() => setAddSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [addQuery, isAdmin, race.clubId, members]);

  const handleDecide = async (request: RaceJoinRequestRow, approve: boolean) => {
    setBusyUserId(request.userId);
    try {
      await decideRaceJoinRequest(request.id, approve);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleAdd = async (user: SearchedClubMember) => {
    setBusyUserId(user.id);
    try {
      await addRaceMember(race.raceId, user.id);
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
    return <LoadError message="Couldn't load the roster." onRetry={reload} />;
  }

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
          {isAdmin && (
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Add a member</Text>
              <TextInput
                style={styles.input}
                placeholder="Search club members by name"
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
