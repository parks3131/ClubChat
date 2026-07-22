import { useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import ChatScreen from "../../../../../../components/ChatScreen";
import { fetchRaceMembers } from "../../../../../../lib/races";
import { useRace } from "./_layout";

// Only a member can be here — index.tsx never links to /chat otherwise
// (mirrors eboard/chat.tsx's own guard), but a direct URL hit needs its
// own check since race.channelId is null until isMember is true.
export default function RaceChatScreen() {
  const race = useRace();
  const router = useRouter();

  const fetchMentionCandidates = useCallback(
    () => fetchRaceMembers(race.raceId).then((rows) => rows.map((r) => ({ id: r.userId, fullName: r.fullName }))),
    [race.raceId]
  );

  useEffect(() => {
    if (!race.isMember) {
      router.replace(`/clubs/${race.clubId}/race/${race.raceId}`);
    }
  }, [race.isMember, race.clubId, race.raceId, router]);

  if (!race.isMember || !race.channelId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ChatScreen
      channelId={race.channelId}
      isAdmin={race.isManager}
      placeholderName={race.name}
      avatarUrl={race.avatarUrl}
      memberPath={(userId) => `/clubs/${race.clubId}/member/${userId}`}
      highlightsPath={`/clubs/${race.clubId}/race/${race.raceId}/highlights`}
      backFallback={`/clubs/${race.clubId}/race/${race.raceId}`}
      titlePath={`/clubs/${race.clubId}/race/${race.raceId}/profile`}
      fetchMentionCandidates={fetchMentionCandidates}
    />
  );
}
