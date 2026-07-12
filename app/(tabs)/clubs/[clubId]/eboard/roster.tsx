import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
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
import { reportError } from "../../../../../lib/reportError";
import { useEboard } from "./_layout";

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
  const [loadError, setLoadError] = useState(false);
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
          {canManage && (
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Add a member</Text>
              <TextInput
                style={styles.input}
                placeholder="Search club admins by name"
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

          {canManage && requests.length > 0 && (
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
    gap: spacing.stackSm + 2,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.stackSm + 4,
  },
  memberAvatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  memberAvatarInitial: { ...typography.labelSm, fontSize: 15, color: colors.primary },
  rowName: { ...typography.bodyMd, fontWeight: "700", fontSize: 15, color: colors.onSurface },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant },
});
