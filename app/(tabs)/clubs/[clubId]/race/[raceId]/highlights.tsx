import HighlightsScreen from "../../../../../../components/HighlightsScreen";
import { useRace } from "./_layout";

export default function RaceHighlightsScreen() {
  const race = useRace();

  return (
    <HighlightsScreen
      channelId={race.channelId}
      memberPath={(userId) => `/clubs/${race.clubId}/member/${userId}`}
      isAdmin={race.isAdmin}
      backFallback={`/clubs/${race.clubId}/race/${race.raceId}/chat`}
    />
  );
}
