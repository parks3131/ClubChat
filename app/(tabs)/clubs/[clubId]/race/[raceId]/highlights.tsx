import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import HighlightsScreen from "../../../../../../components/HighlightsScreen";
import { useRace } from "./_layout";

// Same direct-URL guard as chat.tsx — race.channelId is null until isMember.
export default function RaceHighlightsScreen() {
  const race = useRace();
  const router = useRouter();

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
    <HighlightsScreen
      channelId={race.channelId}
      memberPath={(userId) => `/clubs/${race.clubId}/member/${userId}`}
      isAdmin={race.isManager}
      backFallback={`/clubs/${race.clubId}/race/${race.raceId}/chat`}
    />
  );
}
