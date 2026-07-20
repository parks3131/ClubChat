import { Stack, useRouter } from "expo-router";
import { Text, TouchableOpacity } from "react-native";
import { makeBackHeaderLeft } from "../../../../../components/BackHeaderButton";
import { colors, typography } from "../../../../../constants/theme";
import { useClub } from "../_layout";

// Its own nested Stack (same shape as club-profile/_layout.tsx) rather than
// flat entries in the parent layout, since routines needs several
// sub-screens (activity-type picker, create/edit form, detail) each with
// their own title/back-fallback — only "index" needs the shared
// tappable-club-name + invite-code header the hub/chat/calendar share.
// Header styling mirrors [clubId]/_layout.tsx's clubScreenOptions exactly
// (Anton headline + Energetic Orange) — this nested Stack has its own
// headerShown:false entry in the parent layout, so it never inherited
// that styling for free and had drifted to the pre-redesign default.
export default function RoutinesStackLayout() {
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
          title: "Routines",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}`),
        }}
      />
      <Stack.Screen
        name="activity-type"
        options={{ title: "Add workout", headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/routines`) }}
      />
      <Stack.Screen
        name="workout/create"
        options={{
          title: "New workout",
          presentation: "modal",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/routines`),
        }}
      />
      <Stack.Screen
        name="workout/[workoutId]"
        options={{ title: "Workout", headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/routines`) }}
      />
    </Stack>
  );
}
