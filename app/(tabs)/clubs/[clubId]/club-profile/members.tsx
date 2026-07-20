import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, View } from "react-native";
import MembersScreen, { type MembersScreenRow } from "../../../../../components/MembersScreen";
import { LoadError } from "../../../../../components/LoadError";
import { colors } from "../../../../../constants/theme";
import { useAuth } from "../../../../../contexts/AuthProvider";
import {
  addMember,
  decideJoinRequest,
  demoteToMember,
  fetchClubMembers,
  fetchPendingRequests,
  promoteToAdmin,
  removeMember,
  searchUsersToAdd,
  transferOwnership,
  type ClubMemberRow,
  type JoinRequestRow,
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

// Formerly club-profile/index.tsx's inline add-member/pending-requests/
// roster section, extracted so club-profile can become a slim identity +
// Members/Gallery menu (matching the founder's iMessage-style reference).
export default function ClubMembersScreen() {
  const club = useClub();
  const { session } = useAuth();
  const isAdmin = club.isAdmin;

  const [members, setMembers] = useState<ClubMemberRow[]>([]);
  const [requests, setRequests] = useState<JoinRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const reload = useCallback(() => {
    const loaders: Promise<unknown>[] = [fetchClubMembers(club.clubId).then(setMembers)];
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

  const handlePromote = async (userId: string) => {
    const member = members.find((m) => m.userId === userId);
    if (!member) return;
    const proceed = await confirmAction("Make admin?", `Make ${member.fullName} an admin?`);
    if (!proceed) return;
    setBusyUserId(userId);
    try {
      await promoteToAdmin(club.clubId, userId);
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
    const proceed = await confirmAction("Remove member?", `Remove ${member.fullName} from the club?`);
    if (!proceed) return;
    setBusyUserId(userId);
    try {
      await removeMember(club.clubId, userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDemote = async (userId: string) => {
    const member = members.find((m) => m.userId === userId);
    if (!member) return;
    const proceed = await confirmAction("Demote to member?", `Demote ${member.fullName} to a regular member?`);
    if (!proceed) return;
    setBusyUserId(userId);
    try {
      await demoteToMember(club.clubId, userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleTransferOwnership = async (userId: string) => {
    const member = members.find((m) => m.userId === userId);
    if (!member) return;
    const proceed = await confirmAction(
      "Transfer ownership?",
      `Make ${member.fullName} the owner of this club? You will become an admin.`
    );
    if (!proceed) return;
    setBusyUserId(userId);
    try {
      await transferOwnership(club.clubId, userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDecide = async (requestId: string, approve: boolean) => {
    const request = requests.find((r) => r.id === requestId);
    setBusyUserId(request?.userId ?? null);
    try {
      await decideJoinRequest(requestId, approve);
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
      await addMember(club.clubId, userId);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSearch = (query: string) => searchUsersToAdd(query, members.map((m) => m.userId));

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

  const toRow = (m: ClubMemberRow): MembersScreenRow => ({
    userId: m.userId,
    fullName: m.fullName,
    avatarUrl: m.avatarUrl,
    isSelf: m.userId === session?.user.id,
    role: m.role,
    // remove_member (Owner or Admin removes a Member) vs remove_admin
    // (Owner only removes an Admin outright) — the Owner's own row is
    // never removable through this UI at all (must transfer first).
    removable:
      m.userId !== session?.user.id &&
      ((m.role === "member" && isAdmin) || (m.role === "admin" && club.isOwner)),
    canPromote: isAdmin && m.role === "member",
    canDemote: isAdmin && m.role === "admin",
    canTransferOwnership: club.isOwner && m.role !== "owner" && m.userId !== session?.user.id,
  });

  const adminRows = members.filter((m) => m.role === "admin" || m.role === "owner").map(toRow);
  const memberRows = members.filter((m) => m.role === "member").map(toRow);

  return (
    <MembersScreen
      adminRows={adminRows}
      memberRows={memberRows}
      requests={isAdmin ? requests.map((r) => ({ id: r.id, userId: r.userId, fullName: r.fullName })) : []}
      canManage={isAdmin}
      busyUserId={busyUserId}
      onDecideRequest={handleDecide}
      onPromote={handlePromote}
      onDemote={handleDemote}
      onTransferOwnership={handleTransferOwnership}
      onRemove={handleRemove}
      onSearch={handleSearch}
      onAdd={handleAdd}
      memberPath={(userId) => `/clubs/${club.clubId}/member/${userId}`}
      addPlaceholder="Search by name"
    />
  );
}
