import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, View } from "react-native";
import { LoadError } from "../../../../../../components/LoadError";
import MembersScreen, { type MembersScreenRow } from "../../../../../../components/MembersScreen";
import { colors } from "../../../../../../constants/theme";
import { useAuth } from "../../../../../../contexts/AuthProvider";
import { fetchClubMembers, type ClubMemberRow } from "../../../../../../lib/members";
import {
  addRaceMember,
  decideRaceJoinRequest,
  fetchPendingRaceRequests,
  fetchRaceMembers,
  removeRaceMember,
  searchClubMembersToAdd,
  type RaceJoinRequestRow,
  type RaceMemberRow,
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

// Reached by tapping the race name in the header, same "tap the name to
// manage membership" pattern used everywhere else. Membership is no
// longer automatic for admins/owner (race-channel rework) — every row
// shown here is a real race_members row, split into Managers/Members
// purely by the underlying club role for display, not by whether they
// were "auto-added." clubMemberRoles is just a role lookup, not a
// separate implicit section.
export default function RaceRosterScreen() {
  const race = useRace();
  const isManager = race.isManager;
  const { session } = useAuth();

  const [clubMemberRoles, setClubMemberRoles] = useState<ClubMemberRow[]>([]);
  const [members, setMembers] = useState<RaceMemberRow[]>([]);
  const [requests, setRequests] = useState<RaceJoinRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const reload = useCallback(() => {
    const loaders: Promise<unknown>[] = [
      fetchClubMembers(race.clubId).then(setClubMemberRoles),
      fetchRaceMembers(race.raceId).then(setMembers),
    ];
    if (isManager) {
      loaders.push(fetchPendingRaceRequests(race.raceId).then(setRequests));
    }
    return Promise.all(loaders);
  }, [race.raceId, race.clubId, isManager]);

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
      await decideRaceJoinRequest(requestId, approve);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleAdd = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await addRaceMember(race.raceId, userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = async (userId: string) => {
    const member = members.find((m) => m.userId === userId);
    if (!member) return;
    const proceed = await confirmAction("Remove member?", `Remove ${member.fullName} from this race?`);
    if (!proceed) return;
    setBusyUserId(userId);
    try {
      await removeRaceMember(race.raceId, userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSearch = (query: string) => searchClubMembersToAdd(race.clubId, query, members.map((m) => m.userId));

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

  // Every row here is a real race_members insert — no more implicit
  // "club admins have automatic access" rows. Split into Managers/Members
  // purely for display, using each person's underlying club role.
  const roleByUserId = new Map(clubMemberRoles.map((m) => [m.userId, m.role]));
  const isRoleManager = (userId: string) => {
    const role = roleByUserId.get(userId);
    return role === "admin" || role === "owner";
  };

  const toRow = (m: RaceMemberRow): MembersScreenRow => ({
    userId: m.userId,
    fullName: m.fullName,
    avatarUrl: m.avatarUrl,
    isSelf: m.userId === session?.user.id,
    removable: isManager && m.userId !== session?.user.id,
  });

  const adminRows: MembersScreenRow[] = members.filter((m) => isRoleManager(m.userId)).map(toRow);
  const memberRows: MembersScreenRow[] = members.filter((m) => !isRoleManager(m.userId)).map(toRow);

  return (
    <MembersScreen
      adminRows={adminRows}
      memberRows={memberRows}
      requests={isManager ? requests.map((r) => ({ id: r.id, userId: r.userId, fullName: r.fullName })) : []}
      canManage={isManager}
      busyUserId={busyUserId}
      onDecideRequest={handleDecide}
      onRemove={handleRemove}
      onSearch={handleSearch}
      onAdd={handleAdd}
      memberPath={(userId) => `/clubs/${race.clubId}/member/${userId}`}
      addPlaceholder="Search club members by name"
    />
  );
}
