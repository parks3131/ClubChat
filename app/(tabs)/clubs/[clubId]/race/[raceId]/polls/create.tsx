import { PollCreateScreen } from "../../../../../../../components/PollCreateScreen";
import { useRace } from "../_layout";

export default function RacePollCreateScreen() {
  const race = useRace();

  return (
    <PollCreateScreen
      scope={{ type: "race", clubId: race.clubId, raceId: race.raceId }}
      canCreate={race.isAdmin}
      listPath={`/clubs/${race.clubId}/race/${race.raceId}/polls`}
      pollPath={(pollId) => `/clubs/${race.clubId}/race/${race.raceId}/polls/${pollId}`}
    />
  );
}
