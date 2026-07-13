import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { PollDetailScreen } from "../../../../../../components/PollDetailScreen";
import { useEboard } from "../_layout";

// Only a member can be here — same direct-URL guard as chat.tsx.
export default function EboardPollDetailScreen() {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  const eboard = useEboard();
  const router = useRouter();

  useEffect(() => {
    if (!eboard.channel?.isMember) {
      router.replace(`/clubs/${eboard.clubId}/eboard`);
    }
  }, [eboard.channel, eboard.clubId, router]);

  if (!eboard.channel?.isMember) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <PollDetailScreen pollId={pollId} backPath={`/clubs/${eboard.clubId}/eboard/polls`} />;
}
