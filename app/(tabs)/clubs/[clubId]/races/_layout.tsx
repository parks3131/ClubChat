import { Stack, useRouter } from "expo-router";
import { Text, TouchableOpacity } from "react-native";
import { makeBackHeaderLeft } from "../../../../../components/BackHeaderButton";
import { colors, typography } from "../../../../../constants/theme";
import { useClub } from "../_layout";

// Own nested Stack (same shape as routines/_layout.tsx) since "create" is
// a separate sub-screen with its own back-fallback — only "index" needs
// the shared tappable-club-name + invite-code header. Header styling
// mirrors [clubId]/_layout.tsx's clubScreenOptions exactly (Anton headline
// + Energetic Orange) — this nested Stack has its own headerShown:false
// entry in the parent layout, so it never inherited that styling for
// free and had drifted to the pre-redesign default (including the old
// hardcoded #2563eb blue for the invite code).
export default function RacesStackLayout() {
  const club = useClub();
  const router = useRouter();

  const clubScreenOptions = {
    headerStyle: { backgroundColor: colors.surfaceContainerLow },
    headerTitle: () => (
      <TouchableOpacity onPress={() => router.push(`/clubs/${club.clubId}/club-profile`)}>
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
          title: "Races & Meets",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}`),
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: "New race channel",
          presentation: "modal",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/races`),
        }}
      />
      <Stack.Screen
        name="[raceId]"
        options={{
          ...clubScreenOptions,
          title: "Race",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/races`),
        }}
      />
    </Stack>
  );
}
