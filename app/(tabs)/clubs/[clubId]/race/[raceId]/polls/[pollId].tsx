import { useLocalSearchParams } from "expo-router";
import { PollDetailScreen } from "../../../../../../../components/PollDetailScreen";
import { useRace } from "../_layout";

export default function RacePollDetailScreen() {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  const race = useRace();

  return <PollDetailScreen pollId={pollId} backPath={`/clubs/${race.clubId}/race/${race.raceId}/polls`} />;
}
