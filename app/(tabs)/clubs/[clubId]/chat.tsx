import { useCallback } from "react";
import ChatScreen from "../../../../components/ChatScreen";
import { fetchClubMembers } from "../../../../lib/members";
import { useClub } from "./_layout";

export default function ClubChatScreen() {
  const club = useClub();

  const fetchMentionCandidates = useCallback(
    () => fetchClubMembers(club.clubId).then((rows) => rows.map((r) => ({ id: r.userId, fullName: r.fullName }))),
    [club.clubId]
  );

  return (
    <ChatScreen
      channelId={club.channelId}
      isAdmin={club.isAdmin}
      placeholderName={club.name}
      avatarUrl={club.avatarUrl}
      memberPath={(userId) => `/clubs/${club.clubId}/member/${userId}`}
      highlightsPath={`/clubs/${club.clubId}/highlights`}
      backFallback={`/clubs/${club.clubId}`}
      titlePath={`/clubs/${club.clubId}/club-profile`}
      fetchMentionCandidates={fetchMentionCandidates}
    />
  );
}
