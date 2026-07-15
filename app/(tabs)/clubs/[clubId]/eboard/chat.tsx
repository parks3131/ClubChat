import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import ChatScreen from "../../../../../components/ChatScreen";
import { useEboard } from "./_layout";

// Only a member can be here — index.tsx never links to /chat otherwise,
// but a direct URL hit needs its own guard.
export default function EboardChatScreen() {
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
    <ChatScreen
      channelId={eboard.channel.channelId}
      // Every eboard_channel_member is guaranteed to already be a club
      // admin (enforced in the insert policy, migration 0017_eboard.sql)
      // — no separate "eboard admin" role needed for pin/announce rights.
      isAdmin
      placeholderName={eboard.channel.name}
      memberPath={(userId) => `/clubs/${eboard.clubId}/member/${userId}`}
      highlightsPath={`/clubs/${eboard.clubId}/eboard/highlights`}
      backFallback={`/clubs/${eboard.clubId}/eboard`}
      titlePath={`/clubs/${eboard.clubId}/eboard/profile`}
    />
  );
}
