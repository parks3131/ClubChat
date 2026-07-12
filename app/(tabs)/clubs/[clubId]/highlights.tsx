import HighlightsScreen from "../../../../components/HighlightsScreen";
import { useClub } from "./_layout";

export default function ClubHighlightsScreen() {
  const club = useClub();

  return (
    <HighlightsScreen
      channelId={club.channelId}
      memberPath={(userId) => `/clubs/${club.clubId}/member/${userId}`}
      isAdmin={club.role === "admin"}
      backFallback={`/clubs/${club.clubId}/chat`}
    />
  );
}
