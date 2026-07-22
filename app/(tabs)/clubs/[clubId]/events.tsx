import EventsListScreen from "../../../../components/EventsListScreen";
import { useClub } from "./_layout";

export default function ClubEventsScreen() {
  const club = useClub();
  return <EventsListScreen mode="club" clubId={club.clubId} isAdmin={club.isAdmin} />;
}
