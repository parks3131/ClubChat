import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { LoadError } from "../../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../../constants/theme";
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
import { reportError } from "../../../../../../lib/reportError";
import { useRace } from "./_layout";

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
  const [loadError, setLoadError] = useState(false);
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
      searchRaceParticipantsToAdd(race.raceId, trimmed, allGroupedUserIds)
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

  if (loadError) {
    return <LoadError message="Couldn't load car assignments." onRetry={reload} />;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
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
              {race.isManager && (
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
                  {race.isManager && (
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

            {race.isManager && (
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
                    {addSearching && <ActivityIndicator style={{ marginTop: spacing.stackSm }} color={colors.primary} />}
                    {addResults.map((user) => (
                      <Pressable
                        key={user.id}
                        style={(state) => [styles.addResultRow, (state as { hovered?: boolean }).hovered && styles.addResultRowHovered]}
                        disabled={busyKey === `add:${user.id}`}
                        onPress={() => handleAddMember(group.id, user)}
                      >
                        <Text style={styles.memberName}>{user.fullName}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      />

      {race.isManager && (
        <TouchableOpacity style={styles.fab} disabled={creatingGroup} onPress={handleCreateGroup}>
          {creatingGroup ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.fabText}>+ Add Group</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.marginMobile, paddingBottom: 80, gap: spacing.stackSm },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant },
  groupCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
    marginBottom: spacing.stackSm,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.stackSm,
  },
  groupName: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface },
  deleteGroupText: { fontSize: 13, fontWeight: "600", color: colors.error },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm, paddingVertical: spacing.unit + 2 },
  memberAvatar: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  memberAvatarInitial: { ...typography.labelSm, fontSize: 13, color: colors.primary },
  memberInfo: { flex: 1 },
  memberName: { ...typography.bodyMd, fontWeight: "700", fontSize: 15, color: colors.onSurface },
  inchargeBadge: {
    ...typography.labelSm,
    fontSize: 11,
    color: colors.onPrimaryFixedVariant,
    backgroundColor: colors.primaryFixed,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.stackSm - 2,
    paddingVertical: 1,
    alignSelf: "flex-start",
    marginTop: 2,
    overflow: "hidden",
  },
  memberActions: { flexDirection: "row", gap: spacing.unit + 2 },
  noMembers: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, fontStyle: "italic", marginVertical: spacing.unit },
  smallButton: { borderRadius: radii.sm, paddingVertical: spacing.unit + 1, paddingHorizontal: spacing.stackSm, backgroundColor: colors.surfaceContainerHigh },
  smallButtonText: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceVariant },
  removeButton: { backgroundColor: colors.errorContainer },
  removeButtonText: { fontSize: 12, fontWeight: "600", color: colors.error },
  addSection: { marginTop: spacing.stackSm, borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingTop: spacing.stackSm },
  addToggle: { fontSize: 13, fontWeight: "700", color: colors.primary },
  input: {
    ...typography.bodyMd,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    padding: spacing.stackSm,
    marginTop: spacing.stackSm,
  },
  addResultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.stackSm,
    marginTop: spacing.stackSm,
  },
  addResultRowHovered: { backgroundColor: colors.primaryFixed, borderColor: colors.primary },
  fab: {
    position: "absolute",
    right: spacing.marginMobile,
    bottom: spacing.marginMobile,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: spacing.gutter + 2,
    paddingVertical: spacing.stackSm + 4,
  },
  fabText: { ...typography.labelSm, fontSize: 13, color: colors.onPrimary, textTransform: "none" },
});
