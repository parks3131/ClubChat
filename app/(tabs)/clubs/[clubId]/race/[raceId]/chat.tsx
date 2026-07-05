import ChatScreen from "../../../../../../components/ChatScreen";
import { useRace } from "./_layout";

export default function RaceChatScreen() {
  const race = useRace();

  return (
    <ChatScreen
      channelId={race.channelId}
      isAdmin={race.isAdmin}
      placeholderName={race.name}
      memberPath={(userId) => `/clubs/${race.clubId}/member/${userId}`}
      highlightsPath={`/clubs/${race.clubId}/race/${race.raceId}/highlights`}
    />
  );
}
