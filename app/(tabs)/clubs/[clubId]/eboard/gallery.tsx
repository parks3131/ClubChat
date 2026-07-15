import GalleryScreen from "../../../../../components/GalleryScreen";
import { useEboard } from "./_layout";

export default function EboardGalleryScreen() {
  const eboard = useEboard();
  if (!eboard.channel) return null;
  return <GalleryScreen channelId={eboard.channel.channelId} />;
}
