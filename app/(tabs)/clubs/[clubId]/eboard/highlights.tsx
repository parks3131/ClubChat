import HighlightsScreen from "../../../../../components/HighlightsScreen";
import { useEboard } from "./_layout";

export default function EboardHighlightsScreen() {
  const eboard = useEboard();
  if (!eboard.channel) return null;

  return (
    <HighlightsScreen
      channelId={eboard.channel.channelId}
      memberPath={(userId) => `/clubs/${eboard.clubId}/member/${userId}`}
      isAdmin
      backFallback={`/clubs/${eboard.clubId}/eboard/chat`}
    />
  );
}
