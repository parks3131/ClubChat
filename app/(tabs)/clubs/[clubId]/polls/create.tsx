import { PollCreateScreen } from "../../../../../components/PollCreateScreen";
import { useClub } from "../_layout";

export default function ClubPollCreateScreen() {
  const club = useClub();

  return (
    <PollCreateScreen
      scope={{ type: "club", clubId: club.clubId }}
      canCreate={club.isAdmin}
      listPath={`/clubs/${club.clubId}/polls`}
      pollPath={(pollId) => `/clubs/${club.clubId}/polls/${pollId}`}
    />
  );
}
