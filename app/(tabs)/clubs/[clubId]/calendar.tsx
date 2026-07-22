import CalendarScreen from "../../../../components/CalendarScreen";
import { useClub } from "./_layout";

export default function ClubCalendarScreen() {
  const club = useClub();
  return <CalendarScreen mode="club" clubId={club.clubId} isAdmin={club.isAdmin} />;
}
