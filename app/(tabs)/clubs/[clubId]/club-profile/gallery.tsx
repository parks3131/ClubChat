import GalleryScreen from "../../../../../components/GalleryScreen";
import { useClub } from "../_layout";

export default function ClubGalleryScreen() {
  const club = useClub();
  return <GalleryScreen channelId={club.channelId} />;
}
