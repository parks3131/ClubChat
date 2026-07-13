import { useLocalSearchParams } from "expo-router";
import { PollDetailScreen } from "../../../../../components/PollDetailScreen";
import { useClub } from "../_layout";

export default function ClubPollDetailScreen() {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  const club = useClub();

  return <PollDetailScreen pollId={pollId} backPath={`/clubs/${club.clubId}/polls`} />;
}
