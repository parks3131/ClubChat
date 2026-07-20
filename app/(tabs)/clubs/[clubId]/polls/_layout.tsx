import { Stack, useRouter } from "expo-router";
import { Text, TouchableOpacity } from "react-native";
import { makeBackHeaderLeft } from "../../../../../components/BackHeaderButton";
import { colors, typography } from "../../../../../constants/theme";
import { useClub } from "../_layout";

// Own nested Stack (same shape as races/_layout.tsx) — "create" and
// "[pollId]" each need their own back-fallback, only "index" gets the
// shared tappable-club-name + invite-code header. Header styling mirrors
// [clubId]/_layout.tsx's clubScreenOptions exactly (Anton headline +
// Energetic Orange) — this nested Stack has its own headerShown:false
// entry in the parent layout, so it never inherited that styling for
// free and had drifted to the pre-redesign default (including the old
// hardcoded #2563eb blue for the invite code).
export default function PollsStackLayout() {
  const club = useClub();
  const router = useRouter();

  const clubScreenOptions = {
    headerStyle: { backgroundColor: colors.surfaceContainerLow },
    headerTitle: () => (
      <TouchableOpacity onPress={() => router.push(`/clubs/${club.clubId}/club-profile`)}>
        <Text style={{ ...typography.headlineLgMobile, fontSize: 17, color: colors.primary }}>{club.name}</Text>
      </TouchableOpacity>
    ),
    headerRight: () =>
      club.isAdmin ? (
        <Text style={{ ...typography.labelSm, marginRight: 16, color: colors.primary, textTransform: "uppercase" as const }}>
          Invite: {club.inviteCode}
        </Text>
      ) : null,
  };

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          ...clubScreenOptions,
          title: "Polls",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}`),
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: "New poll",
          presentation: "modal",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/polls`),
        }}
      />
      <Stack.Screen
        name="[pollId]"
        options={{
          title: "Poll",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/polls`),
        }}
      />
    </Stack>
  );
}
