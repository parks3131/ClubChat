import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useAuth } from "../../../../../../contexts/AuthProvider";
import {
  addCarGroupMember,
  createCarGroup,
  deleteCarGroup,
  fetchCarGroups,
  removeCarGroupMember,
  searchRaceParticipantsToAdd,
  setCarGroupIncharge,
  type CarGroup,
  type SearchedRaceParticipant,
} from "../../../../../../lib/carGroups";
import { useRace } from "./_layout";

function reportError(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong";
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert("Error", message);
}

// From a founder wireframe: admins create auto-numbered groups under a
// race ("Group 1", "Group 2", ...), add members scoped to who already
// has race access (not the whole club — see searchRaceParticipantsToAdd),
// and designate one Incharge per group. A person can only be in one
// group per race (enforced by a unique(race_id, user_id) constraint in
// migration 0021), so the add-member pool excludes anyone already in any
// group. Regular race members see the same view read-only.
export default function RaceCarpoolScreen() {
  const race = useRace();
  const { session } = useAuth();

  const [groups, setGroups] = useState<CarGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SearchedRaceParticipant[]>([]);
  const [addSearching, setAddSearching] = useState(false);

  const reload = useCallback(() => fetchCarGroups(race.raceId).then(setGroups), [race.raceId]);

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

  // Memoized: recomputing this as a fresh array on every render (it was
  // previously a plain flatMap call) put a new array in the debounce
  // effect's dependency list every render, and that effect's own
  // setAddResults([]) call triggered exactly that re-render — an
  // infinite loop caught immediately by Playwright the moment "+ Add
  // member" was clicked (66 console errors, "Maximum update depth
  // exceeded"). Keying on `groups` means the array is stable across
  // renders that don't actually change membership.
  const allGroupedUserIds = useMemo(() => groups.flatMap((g) => g.members.map((m) => m.userId)), [groups]);

  useEffect(() => {
    if (!addingToGroupId) return;
    const trimmed = addQuery.trim();
    if (trimmed.length < 2) {
      setAddResults([]);
      return;
    }
    setAddSearching(true);
    const timeout = setTimeout(() => {
      searchRaceParticipantsToAdd(race.raceId, race.clubId, trimmed, allGroupedUserIds)
        .then(setAddResults)
        .catch(reportError)
        .finally(() => setAddSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [addQuery, addingToGroupId, race.raceId, race.clubId, allGroupedUserIds]);

  const handleCreateGroup = async () => {
    if (!session) return;
    setCreatingGroup(true);
    try {
      await createCarGroup({ raceId: race.raceId, name: `Group ${groups.length + 1}`, createdBy: session.user.id });
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setCreatingGroup(false);
    }
  };

  const toggleAddMember = (groupId: string) => {
    setAddingToGroupId((current) => (current === groupId ? null : groupId));
    setAddQuery("");
    setAddResults([]);
  };

  const handleAddMember = async (groupId: string, user: SearchedRaceParticipant) => {
    if (!session) return;
    setBusyKey(`add:${user.id}`);
    try {
      await addCarGroupMember({ carGroupId: groupId, raceId: race.raceId, userId: user.id, addedBy: session.user.id });
      setAddQuery("");
      setAddResults([]);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    setBusyKey(`remove:${userId}`);
    try {
      await removeCarGroupMember(groupId, userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleIncharge = async (group: CarGroup, userId: string) => {
    setBusyKey(`incharge:${userId}`);
    try {
      await setCarGroupIncharge(group.id, group.inchargeUserId === userId ? null : userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteGroup = (group: CarGroup) => {
    const doDelete = async () => {
      setBusyKey(`deleteGroup:${group.id}`);
      try {
        await deleteCarGroup(group.id);
        await reload();
      } catch (err) {
        reportError(err);
      } finally {
        setBusyKey(null);
      }
    };

    // react-native-web's Alert.alert is a no-op, so confirm via window.confirm there.
    if (Platform.OS === "web") {
      if (window.confirm(`Delete ${group.name}? This can't be undone.`)) doDelete();
      return;
    }

    Alert.alert(`Delete ${group.name}?`, "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No car groups yet.</Text>}
        renderItem={({ item: group }) => (
          <View style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>{group.name}</Text>
              {race.isAdmin && (
                <TouchableOpacity
                  disabled={busyKey === `deleteGroup:${group.id}`}
                  onPress={() => handleDeleteGroup(group)}
                >
                  <Text style={styles.deleteGroupText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>

            {group.members.map((member) => {
              const isIncharge = group.inchargeUserId === member.userId;
              return (
                <View key={member.userId} style={styles.memberRow}>
                  {member.avatarUrl ? (
                    <Image source={{ uri: member.avatarUrl }} style={styles.memberAvatar} />
                  ) : (
                    <View style={[styles.memberAvatar, styles.avatarPlaceholder]}>
                      <Text style={styles.memberAvatarInitial}>{member.fullName.charAt(0).toUpperCase() || "?"}</Text>
                    </View>
                  )}
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.fullName}</Text>
                    {isIncharge && <Text style={styles.inchargeBadge}>Incharge</Text>}
                  </View>
                  {race.isAdmin && (
                    <View style={styles.memberActions}>
                      <TouchableOpacity
                        style={styles.smallButton}
                        disabled={busyKey === `incharge:${member.userId}`}
                        onPress={() => handleToggleIncharge(group, member.userId)}
                      >
                        <Text style={styles.smallButtonText}>{isIncharge ? "Remove Incharge" : "Make Incharge"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallButton, styles.removeButton]}
                        disabled={busyKey === `remove:${member.userId}`}
                        onPress={() => handleRemoveMember(group.id, member.userId)}
                      >
                        <Text style={styles.removeButtonText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
            {group.members.length === 0 && <Text style={styles.noMembers}>No members yet.</Text>}

            {race.isAdmin && (
              <View style={styles.addSection}>
                <TouchableOpacity onPress={() => toggleAddMember(group.id)}>
                  <Text style={styles.addToggle}>{addingToGroupId === group.id ? "Cancel" : "+ Add member"}</Text>
                </TouchableOpacity>
                {addingToGroupId === group.id && (
                  <View>
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
                        <Text style={styles.memberName}>{user.fullName}</Text>
                        <TouchableOpacity
                          style={[styles.smallButton, styles.addButton]}
                          disabled={busyKey === `add:${user.id}`}
                          onPress={() => handleAddMember(group.id, user)}
                        >
                          <Text style={styles.addButtonText}>Add</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      />

      {race.isAdmin && (
        <TouchableOpacity style={styles.fab} disabled={creatingGroup} onPress={handleCreateGroup}>
          <Text style={styles.fabText}>{creatingGroup ? "Creating…" : "+ Add Group"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 12, paddingBottom: 80, gap: 10 },
  empty: { textAlign: "center", marginTop: 40, color: "#888" },
  groupCard: { backgroundColor: "#f8fafc", borderRadius: 12, padding: 14, marginBottom: 10 },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  groupName: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  deleteGroupText: { fontSize: 13, fontWeight: "600", color: "#dc2626" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  memberAvatar: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: { backgroundColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  memberAvatarInitial: { fontSize: 13, fontWeight: "700", color: "#475569" },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  inchargeBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563eb",
    backgroundColor: "#dbeafe",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignSelf: "flex-start",
    marginTop: 2,
    overflow: "hidden",
  },
  memberActions: { flexDirection: "row", gap: 6 },
  noMembers: { fontSize: 13, color: "#94a3b8", fontStyle: "italic", marginVertical: 4 },
  smallButton: { borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "#e2e8f0" },
  smallButtonText: { fontSize: 12, fontWeight: "600", color: "#334155" },
  removeButton: { backgroundColor: "#fee2e2" },
  removeButtonText: { fontSize: 12, fontWeight: "600", color: "#dc2626" },
  addSection: { marginTop: 8, borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 8 },
  addToggle: { fontSize: 13, fontWeight: "700", color: "#2563eb" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, fontSize: 14, marginTop: 8 },
  addResultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  addButton: { backgroundColor: "#16a34a" },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 12 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: "#2563eb",
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  fabText: { color: "#fff", fontWeight: "700" },
});
