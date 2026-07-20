import { PollsListScreen } from "../../../../../components/PollsListScreen";
import { useClub } from "../_layout";

export default function ClubPollsListScreen() {
  const club = useClub();

  return (
    <PollsListScreen
      scope={{ type: "club", clubId: club.clubId }}
      canCreate={club.isAdmin}
      createPath={`/clubs/${club.clubId}/polls/create`}
      pollPath={(pollId) => `/clubs/${club.clubId}/polls/${pollId}`}
    />
  );
}
