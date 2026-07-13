import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../../constants/theme";
import {
  addRaceMember,
  decideRaceJoinRequest,
  fetchPendingRaceRequests,
  fetchRaceMembers,
  removeRaceMember,
  searchClubMembersToAdd,
  type RaceJoinRequestRow,
  type RaceMemberRow,
  type SearchedClubMember,
} from "../../../../../../lib/races";
import { reportError } from "../../../../../../lib/reportError";
import { useRace } from "./_layout";

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

  const handleRemove = async (member: RaceMemberRow) => {
    const proceed = await confirmAction("Remove member?", `Remove ${member.fullName} from this race?`);
    if (!proceed) return;
    setBusyUserId(member.userId);
    try {
      await removeRaceMember(race.raceId, member.userId);
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
          {isAdmin && (
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Add a member</Text>
              <TextInput
                style={styles.input}
                placeholder="Search club members by name"
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="none"
                value={addQuery}
                onChangeText={setAddQuery}
              />
              {addSearching && <ActivityIndicator style={{ marginTop: spacing.stackSm }} color={colors.primary} />}
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
              <Text style={styles.sectionTitle}>Pending requests</Text>
              {requests.map((r) => (
                <View key={r.id} style={styles.requestRow}>
                  <Text style={styles.rowName}>{r.fullName}</Text>
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

          <Text style={styles.sectionTitle}>Members</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.memberRow}>
          <View style={styles.memberInfo}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.memberAvatar} />
            ) : (
              <View style={[styles.memberAvatar, styles.avatarPlaceholder]}>
                <Text style={styles.memberAvatarInitial}>{item.fullName.charAt(0).toUpperCase() || "?"}</Text>
              </View>
            )}
            <Text style={styles.rowName}>{item.fullName}</Text>
          </View>
          {isAdmin && (
            <TouchableOpacity
              style={styles.iconTextButton}
              onPress={() => handleRemove(item)}
              disabled={busyUserId === item.userId}
            >
              <MaterialIcons name="person-remove" size={18} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No members yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.marginMobile, gap: spacing.stackSm, backgroundColor: colors.surface },
  sectionTitle: { ...typography.statValue, fontSize: 15, color: colors.onSurface, marginTop: spacing.stackMd, marginBottom: spacing.stackSm },
  addSection: { marginBottom: spacing.unit },
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
    marginTop: spacing.stackSm,
  },
  addResultRowHovered: { backgroundColor: colors.primaryFixed, borderColor: colors.primary },
  requestsSection: { marginBottom: spacing.unit },
  requestRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.stackSm + 4,
    marginBottom: spacing.stackSm,
  },
  requestActions: { flexDirection: "row", gap: spacing.stackSm },
  iconActionButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  denyIconButton: { backgroundColor: colors.errorContainer },
  approveIconButton: { backgroundColor: colors.primary },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.stackSm + 4,
  },
  memberInfo: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm + 2 },
  memberAvatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  memberAvatarInitial: { ...typography.labelSm, fontSize: 15, color: colors.primary },
  rowName: { ...typography.bodyMd, fontWeight: "700", fontSize: 15, color: colors.onSurface },
  iconTextButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant },
});
