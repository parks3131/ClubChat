import GalleryScreen from "../../../../../../components/GalleryScreen";
import { useRace } from "./_layout";

export default function RaceGalleryScreen() {
  const race = useRace();
  return <GalleryScreen channelId={race.channelId} />;
}
