import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import MembersScreen, { type MembersScreenRow } from "../../../../../components/MembersScreen";
import { colors } from "../../../../../constants/theme";
import {
  addEboardMember,
  decideEboardJoinRequest,
  fetchEboardMembers,
  fetchPendingEboardRequests,
  removeEboardMember,
  searchClubAdminsToAdd,
  type EboardJoinRequestRow,
  type EboardMemberRow,
} from "../../../../../lib/eboard";
import { reportError } from "../../../../../lib/reportError";
import { useClub } from "../_layout";
import { useEboard } from "./_layout";

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

// Mirrors race/[raceId]/roster.tsx, but add/decide rights belong to
// existing members only (eboard.channel.isMember), not to every club
// admin — see migration 0017_eboard.sql. Unlike races, membership here is
// *not* implied by club-admin status (the opposite asymmetry), so every
// eboard_channel_members row is already guaranteed to be a club admin —
// there's no separate "Members" tier to show.
export default function EboardRosterScreen() {
  const eboard = useEboard();
  const club = useClub();
  const canManage = eboard.channel?.isMember ?? false;

  const [members, setMembers] = useState<EboardMemberRow[]>([]);
  const [requests, setRequests] = useState<EboardJoinRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

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

  const handleDecide = async (requestId: string, approve: boolean) => {
    const request = requests.find((r) => r.id === requestId);
    setBusyUserId(request?.userId ?? null);
    try {
      await decideEboardJoinRequest(requestId, approve);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleAdd = async (userId: string) => {
    if (!eboard.channel) return;
    setBusyUserId(userId);
    try {
      await addEboardMember(eboard.channel.id, userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!eboard.channel) return;
    const member = members.find((m) => m.userId === userId);
    if (!member) return;
    const proceed = await confirmAction("Remove member?", `Remove ${member.fullName} from Eboard & Council?`);
    if (!proceed) return;
    setBusyUserId(userId);
    try {
      await removeEboardMember(eboard.channel.id, userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSearch = (query: string) => searchClubAdminsToAdd(eboard.clubId, query, members.map((m) => m.userId));

  if (loadError) {
    return <LoadError message="Couldn't load the roster." onRetry={reload} />;
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Every eboard_channel_members row is already guaranteed to be a club
  // admin (enforced by the insert policy), so removing anyone here is
  // "kicking an admin out of the group" — creator-only (migration 0041).
  const adminRows: MembersScreenRow[] = members.map((m) => ({
    userId: m.userId,
    fullName: m.fullName,
    avatarUrl: m.avatarUrl,
    isSelf: m.userId === eboard.userId,
    removable: club.isCreator && m.userId !== eboard.userId,
  }));

  return (
    <MembersScreen
      adminRows={adminRows}
      memberRows={[]}
      requests={canManage ? requests.map((r) => ({ id: r.id, userId: r.userId, fullName: r.fullName })) : []}
      canManage={canManage}
      busyUserId={busyUserId}
      onDecideRequest={handleDecide}
      onRemove={handleRemove}
      onSearch={handleSearch}
      onAdd={handleAdd}
      memberPath={(userId) => `/clubs/${eboard.clubId}/member/${userId}`}
      addPlaceholder="Search club admins by name"
    />
  );
}
