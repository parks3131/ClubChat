import ChatScreen from "../../../../components/ChatScreen";
import { useClub } from "./_layout";

export default function ClubChatScreen() {
  const club = useClub();

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
    />
  );
}
