import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { PollCreateScreen } from "../../../../../../components/PollCreateScreen";
import { useEboard } from "../_layout";

// Only a member can be here — same direct-URL guard as chat.tsx.
export default function EboardPollCreateScreen() {
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

  return (
    <PollCreateScreen
      scope={{ type: "eboard", clubId: eboard.clubId, eboardChannelId: eboard.channel.id }}
      canCreate
      listPath={`/clubs/${eboard.clubId}/eboard/polls`}
      pollPath={(pollId) => `/clubs/${eboard.clubId}/eboard/polls/${pollId}`}
      chatPath={`/clubs/${eboard.clubId}/eboard/chat`}
    />
  );
}
