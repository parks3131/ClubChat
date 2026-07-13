import { PollsListScreen } from "../../../../../../../components/PollsListScreen";
import { useRace } from "../_layout";

export default function RacePollsListScreen() {
  const race = useRace();

  return (
    <PollsListScreen
      scope={{ type: "race", clubId: race.clubId, raceId: race.raceId }}
      canCreate={race.isAdmin}
      createPath={`/clubs/${race.clubId}/race/${race.raceId}/polls/create`}
      pollPath={(pollId) => `/clubs/${race.clubId}/race/${race.raceId}/polls/${pollId}`}
    />
  );
}
