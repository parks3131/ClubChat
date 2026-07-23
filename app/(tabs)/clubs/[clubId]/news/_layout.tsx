import { Stack, useRouter } from "expo-router";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { makeBackHeaderLeft } from "../../../../../components/BackHeaderButton";
import { colors, typography } from "../../../../../constants/theme";
import { useClub } from "../_layout";

// Its own nested Stack (same shape as routines/_layout.tsx) since News &
// Highlights has two sub-screens (feed, create/edit form) each with their
// own title/back-fallback. Unlike routines/polls/races/eboard's own
// text-only headerTitle, this one includes the club avatar too, matching
// [clubId]/_layout.tsx's own clubScreenOptions exactly — the founder
// flagged the avatar's absence live while testing this feature, and since
// this Stack is new, there's no reason to carry that same gap forward
// into it (routines/polls/races/eboard's headers are unaffected).
export default function NewsStackLayout() {
  const club = useClub();
  const router = useRouter();

  const clubScreenOptions = {
    headerStyle: { backgroundColor: colors.surfaceContainerLow },
    headerTitle: () => (
      <TouchableOpacity
        onPress={() => router.push(`/clubs/${club.clubId}/club-profile`)}
        style={{ flexDirection: "row" as const, alignItems: "center", gap: 8 }}
      >
        {club.avatarUrl ? (
          <Image source={{ uri: club.avatarUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
        ) : (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.surfaceContainerHigh,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ ...typography.labelSm, fontSize: 16, color: colors.primary }}>
              {club.name.charAt(0).toUpperCase() || "?"}
            </Text>
          </View>
        )}
        <Text style={{ ...typography.headlineLgMobile, fontSize: 17, color: colors.primary }}>{club.name}</Text>
      </TouchableOpacity>
    ),
  };

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          ...clubScreenOptions,
          title: "News & Highlights",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}`),
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: "New post",
          presentation: "modal",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/news`),
        }}
      />
    </Stack>
  );
}
