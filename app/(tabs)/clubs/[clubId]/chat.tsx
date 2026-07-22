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
      attachMenu={{
        createPollPath: `/clubs/${club.clubId}/polls/create`,
        createEventPath: `/clubs/${club.clubId}/event/create`,
      }}
      headerMenu={[
        { label: "Poll", path: `/clubs/${club.clubId}/polls`, icon: "how-to-vote" },
        { label: "Routines", path: `/clubs/${club.clubId}/routines`, icon: "fitness-center" },
        { label: "Events", path: `/clubs/${club.clubId}/events`, icon: "event" },
      ]}
      resolveEventPath={(eventId) => `/clubs/${club.clubId}/event/${eventId}`}
    />
  );
}
